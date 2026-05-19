import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function parseRepo(url?: string | null) {
  if (!url) return null;
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
  return match ? { owner: match[1], repo: match[2].replace(/\.git$/, "") } : null;
}

/**
 * Redirección al último APK firmado.
 *
 * Resuelve, en cada llamada, el asset más reciente directamente desde la API
 * de GitHub usando el `id` del asset (no el nombre del archivo). Esto evita
 * que el QR sirva una versión antigua porque:
 *   - el puntero "latest release" de GitHub quede desfasado,
 *   - haya múltiples assets con el mismo nombre,
 *   - el navegador o un proxy hayan cacheado la URL del binario anterior.
 *
 * El endpoint contesta con un 302 y `Cache-Control: no-store`.
 */
export const Route = createFileRoute("/api/public/apk-download")({
  server: {
    handlers: {
      GET: async () => {
        const { data } = await supabaseAdmin
          .from("apk_config")
          .select("github_repo_url")
          .eq("id", 1)
          .maybeSingle();

        const repo = parseRepo(data?.github_repo_url);
        if (!repo) {
          return new Response("Repo no configurado", { status: 404 });
        }

        const headers: Record<string, string> = {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "solarops-apk-redirect",
        };
        if (process.env.GITHUB_DISPATCH_TOKEN) {
          headers.Authorization = `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`;
        }

        // 1) Intentar el tag rolling "latest".
        // 2) Si no existe, caer al release más reciente del repo.
        let release: any = null;
        const tagged = await fetch(
          `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/tags/latest`,
          { headers, cache: "no-store" as any },
        );
        if (tagged.ok) {
          release = await tagged.json();
        } else {
          const listed = await fetch(
            `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=10`,
            { headers, cache: "no-store" as any },
          );
          if (listed.ok) {
            const arr: any[] = await listed.json();
            release = arr
              .filter((r) => Array.isArray(r.assets) && r.assets.some((a: any) => String(a.name).endsWith(".apk")))
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
          }
        }

        if (!release) {
          return new Response("Sin releases", { status: 404 });
        }

        const assets = [...(release.assets ?? [])].sort((a: any, b: any) => {
          const aTime = new Date(a?.updated_at ?? a?.created_at ?? 0).getTime();
          const bTime = new Date(b?.updated_at ?? b?.created_at ?? 0).getTime();
          return bTime - aTime;
        });
        const apk =
          assets.find((a: any) => String(a.name).endsWith("signed.apk")) ??
          assets.find((a: any) => String(a.name).endsWith(".apk"));

        if (!apk?.browser_download_url) {
          return new Response("APK no encontrado en el release", { status: 404 });
        }

        return new Response(null, {
          status: 302,
          headers: {
            Location: apk.browser_download_url,
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        });
      },
    },
  },
});
