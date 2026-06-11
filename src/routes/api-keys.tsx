import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, KeyRound, Plus, Trash2, ShieldOff, Code2, Radio } from "lucide-react";
import { toast } from "sonner";
import {
  listApiKeys, createApiKey, revokeApiKey, deleteApiKey,
} from "@/lib/api-keys.functions";

export const Route = createFileRoute("/api-keys")({
  component: () => (
    <ProtectedLayout>
      <ApiKeysPage />
    </ProtectedLayout>
  ),
});

interface ApiKey {
  id: string;
  label: string;
  token: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function ApiKeysPage() {
  const list = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const del = useServerFn(deleteApiKey);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    setBaseUrl(typeof window !== "undefined" ? window.location.origin : "");
    refresh();
  }, []);

  async function refresh() {
    const r = await list();
    setKeys((r as any).keys);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await create({ data: { label: label.trim() || "API key" } });
      setLabel("");
      setReveal((s) => ({ ...s, [(r as any).key.id]: true }));
      await refresh();
      toast.success("Clave creada. Cópiala ahora, no se mostrará completa más tarde.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id: string) {
    if (!confirm("¿Revocar esta clave? Dejará de funcionar inmediatamente.")) return;
    await revoke({ data: { id } });
    await refresh();
  }

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar definitivamente esta clave?")) return;
    await del({ data: { id } });
    await refresh();
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copiado al portapapeles");
  }

  function mask(token: string, show: boolean) {
    if (show) return token;
    return token.slice(0, 12) + "•".repeat(24) + token.slice(-4);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4 animate-fade-up">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
          <KeyRound className="h-7 w-7" strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API para integraciones</h1>
          <p className="text-sm text-muted-foreground">
            Genera claves para conectar tu portal con plataformas de domótica (Home Assistant, Node-RED, n8n, etc.).
          </p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3">
          <div className="grow space-y-2">
            <Label>Nombre de la clave</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej. Home Assistant — Casa"
              maxLength={60}
            />
          </div>
          <Button type="submit" disabled={creating} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            {creating ? "Generando…" : "Generar nueva clave"}
          </Button>
        </form>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Tus claves</h2>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no tienes claves. Genera una arriba.</p>
        ) : (
          <ul className="space-y-3">
            {keys.map((k) => {
              const revoked = !!k.revoked_at;
              const show = !!reveal[k.id];
              return (
                <li key={k.id} className="rounded-xl border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{k.label}</span>
                        {revoked ? (
                          <Badge variant="destructive">Revocada</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Activa</Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Creada {new Date(k.created_at).toLocaleString()}
                        {k.last_used_at && ` • Último uso ${new Date(k.last_used_at).toLocaleString()}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!revoked && (
                        <Button size="sm" variant="outline" className="h-8 rounded-xl"
                          onClick={() => setReveal((s) => ({ ...s, [k.id]: !s[k.id] }))}>
                          {show ? "Ocultar" : "Mostrar"}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 rounded-xl" onClick={() => copy(k.token)}>
                        <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
                      </Button>
                      {!revoked && (
                        <Button size="sm" variant="outline" className="h-8 rounded-xl border-amber-300 text-amber-700 hover:bg-amber-50"
                          onClick={() => onRevoke(k.id)}>
                          <ShieldOff className="mr-1 h-3.5 w-3.5" /> Revocar
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={() => onDelete(k.id)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Borrar
                      </Button>
                    </div>
                  </div>
                  <code className="mt-3 block break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                    {mask(k.token, show)}
                  </code>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
          <Code2 className="h-5 w-5 text-indigo-600" /> Cómo usar la API
        </h2>
        <p className="text-sm text-muted-foreground">
          Autentica todas las llamadas con el header <code className="rounded bg-muted px-1">Authorization: Bearer TU_CLAVE</code>.
          Una clave da acceso a todos tus sitios.
        </p>

        <div className="mt-4 space-y-4 text-sm">
          <Endpoint
            method="GET"
            path="/api/public/v1/sites"
            base={baseUrl}
            desc="Lista todos los sitios a los que tienes acceso."
          />
          <Endpoint
            method="GET"
            path="/api/public/v1/sites/{siteId}/telemetry"
            base={baseUrl}
            desc="Última lectura de telemetría (PV, batería, red, carga, modo, estado…)."
          />
          <Endpoint
            method="GET"
            path="/api/public/v1/sites/{siteId}/stream"
            base={baseUrl}
            icon={<Radio className="h-4 w-4 text-emerald-600" />}
            desc="Stream Server-Sent Events (SSE) con cada lectura nueva. Ideal para puentes MQTT con Node-RED / n8n / Home Assistant."
          />
        </div>

        <div className="mt-6 space-y-2 text-sm">
          <p className="font-medium">Ejemplo curl:</p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
{`curl -H "Authorization: Bearer TU_CLAVE" \\
  ${baseUrl}/api/public/v1/sites`}
          </pre>
          <p className="font-medium pt-2">Puente MQTT con Node-RED:</p>
          <p className="text-muted-foreground">
            Nodo <em>http request</em> en modo SSE apuntando a <code className="rounded bg-muted px-1">/stream</code> →
            nodo <em>mqtt out</em> publicando en el tópico de tu broker. Cada evento <code>telemetry</code> trae el JSON listo para reenviar.
          </p>
        </div>
      </div>
    </div>
  );
}

function Endpoint({
  method, path, base, desc, icon,
}: { method: string; path: string; base: string; desc: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="font-mono">{method}</Badge>
        <code className="text-xs">{base}{path}</code>
        {icon}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}
