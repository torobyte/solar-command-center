import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function parseRepo(url?: string | null) {
  if (!url) return null;
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
  return match ? { owner: match[1], repo: match[2].replace(/\.git$/, "") } : null;
}

function normalizePublicBaseUrl(raw?: string | null) {
  const fallback = "https://appsolar.torobyte.com";
  if (!raw) return fallback;

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();

    if (
      hostname === "project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app" ||
      hostname === "project--7cb3041b-eb20-43aa-ba17-b0848cb53051-dev.lovable.app" ||
      hostname === "id-preview--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app" ||
      hostname === "7cb3041b-eb20-43aa-ba17-b0848cb53051.lovableproject.com"
    ) {
      return fallback;
    }

    return `${url.protocol}//${url.host}`.replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

export const Route = createFileRoute("/api/public/apk-latest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const currentVersionCode = Number(new URL(request.url).searchParams.get("current_version_code") ?? "0");

        const { data } = await supabaseAdmin
          .from("apk_config")
          .select("app_id, app_name, version_name, version_code, github_repo_url, server_url")
          .eq("id", 1)
          .maybeSingle();

        const repo = parseRepo(data?.github_repo_url);
        if (!data || !repo) {
          return new Response(JSON.stringify({ update_available: false, reason: "repo_not_configured" }), {
            status: 404,
            headers: { "content-type": "application/json", "cache-control": "public, max-age=30" },
          });
        }

        const headers: Record<string, string> = {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "solarops-apk-updater",
        };
        if (process.env.GITHUB_DISPATCH_TOKEN) {
          headers.Authorization = `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`;
        }

        const releaseRes = await fetch(
          `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/tags/latest`,
          { headers },
        );
        if (!releaseRes.ok) {
          const text = await releaseRes.text().catch(() => "");
          return new Response(
            JSON.stringify({ update_available: false, reason: `github_${releaseRes.status}`, detail: text.slice(0, 300) }),
            {
              status: 502,
              headers: { "content-type": "application/json", "cache-control": "public, max-age=30" },
            },
          );
        }

        const release: any = await releaseRes.json();
        const assets = [...(release.assets ?? [])].sort((a: any, b: any) => {
          const aTime = new Date(a?.updated_at ?? a?.created_at ?? 0).getTime();
          const bTime = new Date(b?.updated_at ?? b?.created_at ?? 0).getTime();
          return bTime - aTime;
        });
        const apkAsset =
          assets.find((asset: any) => String(asset.name).endsWith("signed.apk")) ??
          assets.find((asset: any) => String(asset.name).endsWith(".apk"));
        const shaAsset =
          assets.find((asset: any) => String(asset.name).endsWith("signed.apk.sha256")) ??
          assets.find((asset: any) => String(asset.name).endsWith(".sha256"));
        const bodySha = String(release.body ?? "").match(/[A-Fa-f0-9]{64}/)?.[0]?.toLowerCase() ?? null;

        let checksumSha256 = bodySha;
        if (!checksumSha256 && shaAsset?.browser_download_url) {
          const shaRes = await fetch(shaAsset.browser_download_url, { headers: { "User-Agent": "solarops-apk-updater" } });
          if (shaRes.ok) {
            checksumSha256 = (await shaRes.text()).match(/[A-Fa-f0-9]{64}/)?.[0]?.toLowerCase() ?? null;
          }
        }

        const latestVersionCode = Number(release.body?.match(/versionCode:\s*`?(\d+)`?/)?.[1] ?? data.version_code ?? 0);
        const latestVersionName = String(release.body?.match(/versionName:\s*`?([^`\n]+)`?/)?.[1] ?? data.version_name ?? "");

        // Siempre devolvemos nuestro endpoint público para que el cliente y el
        // panel usen el dominio configurado y resuelvan el asset más nuevo en
        // cada descarga. El query param invalida caches intermedios cuando el
        // release reemplaza el binario manteniendo el mismo nombre.
        const cacheBust = apkAsset?.id ?? apkAsset?.updated_at ?? release.published_at ?? Date.now();
        const publicBaseUrl = normalizePublicBaseUrl((data as any)?.server_url);
        const stableApkUrl = apkAsset
          ? `${publicBaseUrl}/api/public/apk-download?v=${encodeURIComponent(String(cacheBust))}`
          : null;

        return new Response(
          JSON.stringify({
            app_id: data.app_id,
            app_name: data.app_name,
            release_tag: release.tag_name ?? "latest",
            // Para el tag rolling "latest", `release.published_at` queda fijo
            // en la fecha original del tag. Usamos `updated_at` del asset
            // (que sí se refresca con cada subida) para reportar la fecha
            // real de la última build.
            published_at: apkAsset?.updated_at ?? apkAsset?.created_at ?? release.published_at ?? null,
            version_code: latestVersionCode,
            version_name: latestVersionName,
            apk_url: stableApkUrl,
            checksum_sha256: checksumSha256,
            update_available: Boolean(stableApkUrl) && latestVersionCode > currentVersionCode,
          }),
          {
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store, no-cache, must-revalidate",
              pragma: "no-cache",
            },
          },
        );
      },
    },
  },
});