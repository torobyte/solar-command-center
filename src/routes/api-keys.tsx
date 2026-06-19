import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, KeyRound, Plus, Trash2, ShieldOff, Code2, Radio, Globe } from "lucide-react";
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

// Dominio público estable para integraciones externas. Coincide con el
// dominio principal del portal (appsolar.torobyte.com cuando esté apuntado).
const API_BASE = "https://appsolar.torobyte.com";

function ApiKeysPage() {
  const list = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const del = useServerFn(deleteApiKey);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  useEffect(() => { refresh(); }, []);

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
      toast.success("Clave creada. Cópiala ahora.");
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
            Conecta tu portal con Home Assistant, Node-RED, n8n u otras plataformas de domótica.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm flex items-center gap-3">
        <Globe className="h-5 w-5 text-indigo-600" />
        <div className="grow min-w-0">
          <div className="text-xs text-muted-foreground">Dominio base de la API</div>
          <code className="text-sm font-mono break-all">{API_BASE}</code>
        </div>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => copy(API_BASE)}>
          <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
        </Button>
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

      {/* ─────────────── DOCUMENTACIÓN COMPLETA ─────────────── */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Code2 className="h-5 w-5 text-indigo-600" /> Cómo usar la API
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Todas las llamadas requieren el header{" "}
            <code className="rounded bg-muted px-1">Authorization: Bearer TU_CLAVE</code>.
            Una sola clave da acceso a todos tus sitios. Respuestas siempre en JSON
            (excepto el endpoint <code>/stream</code> que devuelve SSE).
          </p>
        </div>

        {/* Autenticación */}
        <Section title="Autenticación">
          <p>
            Esquema: <code>Bearer Token</code>. Envía el header en cada petición:
          </p>
          <Pre>{`Authorization: Bearer tb_live_xxxxxxxxxxxxxxxx`}</Pre>
          <p className="text-xs text-muted-foreground">
            Errores comunes: <b>401</b> clave inválida/revocada · <b>403</b> sin acceso al sitio · <b>404</b> sitio inexistente.
          </p>
        </Section>

        {/* Endpoint 1 */}
        <EndpointDoc
          method="GET"
          path="/api/public/v1/sites"
          desc="Lista todos los sitios a los que tienes acceso (propios y compartidos)."
          params={[]}
          response={`{
  "sites": [
    {
      "id": "uuid",
      "name": "Casa",
      "description": "Inversor 5kW + 12kWh batería",
      "status": "online",        // online | offline | warning | error
      "last_seen_at": "2026-06-12T19:32:11.000Z",
      "plan": "pro"
    }
  ]
}`}
          curl={`curl -H "Authorization: Bearer TU_CLAVE" \\
  ${API_BASE}/api/public/v1/sites`}
        />

        {/* Endpoint 2 */}
        <EndpointDoc
          method="GET"
          path="/api/public/v1/sites/{siteId}/telemetry"
          desc="Última lectura de telemetría del sitio. Devuelve todos los campos disponibles."
          params={[
            { name: "siteId", in: "path", type: "uuid", required: true, desc: "ID del sitio (de /sites)." },
          ]}
          response={`{
  "site": {
    "id": "uuid",
    "name": "Casa",
    "status": "online",
    "last_seen_at": "2026-06-12T19:32:11.000Z"
  },
  "telemetry": {
    "recorded_at":              "2026-06-12T19:32:11.000Z",
    "pv_input_power":           1240,   // W   — potencia solar instantánea
    "pv_input_voltage":         182.4,  // V
    "pv_input_current":         6.8,    // A
    "ac_output_active_power":   980,    // W   — potencia entregada a la carga
    "ac_output_apparent_power": 1020,   // VA
    "ac_output_voltage":        229.8,  // V
    "ac_output_frequency":      50.01,  // Hz
    "battery_capacity":         87,     // %   — SoC reportado por el inversor
    "battery_voltage":          54.2,   // V   — tensión del banco
    "battery_charging_current": 12.3,   // A   — corriente entrando a la batería
    "battery_discharge_current":0,      // A   — corriente saliendo de la batería
    "bus_voltage":              405.0,  // V   — bus DC interno del inversor
    "grid_voltage":             231.4,  // V   — 0 si no hay red
    "grid_frequency":           50.0,   // Hz
    "load_percent":             19,     // %
    "inverter_temperature":     42.1,   // °C
    "inverter_mode":            "Battery", // Battery | Line | Standby | Fault | Power Saving
    "device_status":            "ok",   // ok | warning | error

    // ── Entrada AC (derivados — QPIGS no entrega corriente AC directa) ──
    "ac_input_voltage":          231.4, // V  (= grid_voltage)
    "ac_input_frequency":        50.0,  // Hz (= grid_frequency)
    "ac_input_current":          4.24,  // A  ≈ ac_output_active_power / grid_voltage cuando hay red
    "ac_input_apparent_current": 4.41,  // A  ≈ ac_output_apparent_power / grid_voltage
    "ac_input_active_power":     980,   // W  (potencia tomada de red al estar en modo Line/Bypass)
    "ac_input_source":           "grid",// "grid" si hay red activa y el inversor está en línea, "off" en caso contrario

    // ── Batería (derivados) ──
    "battery_soc":                  87,    // %  alias de battery_capacity
    "battery_charging_power":       666.7, // W  = battery_voltage × battery_charging_current
    "battery_discharging_power":    0,     // W  = battery_voltage × battery_discharge_current
    "battery_power":                666.7, // W  positivo = cargando, negativo = descargando
    "battery_net_current":          12.3,  // A  positivo = cargando, negativo = descargando
    "battery_status":               "charging", // charging | discharging | idle
    "battery_capacity_wh":          5120,  // Wh capacidad útil configurada (null si no está configurada)
    "battery_energy_remaining_wh":  4454,  // Wh estimación = battery_capacity_wh × SoC/100
    "battery_time_remaining_min":   null,  // min de respaldo restantes (sólo si está descargando con carga)
    "battery_time_to_full_min":     401    // min hasta SoC 100% (sólo si está cargando)
  },
  "ts": "2026-06-12T19:32:14.512Z"
}`}
          curl={`curl -H "Authorization: Bearer TU_CLAVE" \\
  ${API_BASE}/api/public/v1/sites/SITE_ID/telemetry`}
        />

        {/* Endpoint 3 */}
        <EndpointDoc
          method="GET"
          path="/api/public/v1/sites/{siteId}/stream"
          icon={<Radio className="h-4 w-4 text-emerald-600" />}
          desc="Stream Server-Sent Events (SSE) con cada lectura nueva del sitio. Ideal para puentes MQTT en Node-RED, n8n o Home Assistant."
          params={[
            { name: "siteId", in: "path", type: "uuid", required: true, desc: "ID del sitio." },
          ]}
          response={`event: hello
data: {"site_id":"uuid","ts":"2026-06-12T19:32:14.512Z"}

event: telemetry
data: {"recorded_at":"2026-06-12T19:32:20.000Z","pv_input_power":1255, ... }

: ping 1718220745000     ← heartbeat (cada 5s si no hay datos nuevos)`}
          curl={`curl -N -H "Authorization: Bearer TU_CLAVE" \\
  ${API_BASE}/api/public/v1/sites/SITE_ID/stream`}
        />

        {/* Home Assistant */}
        <Section title="Ejemplo Home Assistant (REST sensor)">
          <Pre>{`# configuration.yaml
rest:
  - resource: ${API_BASE}/api/public/v1/sites/SITE_ID/telemetry
    scan_interval: 15
    headers:
      Authorization: Bearer TU_CLAVE
    sensor:
      - name: "Solar PV Power"
        value_template: "{{ value_json.telemetry.pv_input_power }}"
        unit_of_measurement: "W"
        device_class: power
      - name: "Solar Battery SoC"
        value_template: "{{ value_json.telemetry.battery_capacity }}"
        unit_of_measurement: "%"
        device_class: battery
      - name: "Solar Load"
        value_template: "{{ value_json.telemetry.ac_output_active_power }}"
        unit_of_measurement: "W"
        device_class: power`}</Pre>
        </Section>

        {/* Node-RED → MQTT */}
        <Section title="Puente MQTT con Node-RED">
          <ol className="list-decimal pl-5 space-y-1 text-sm">
            <li>Nodo <code>http request</code> en modo <b>SSE</b> apuntando a
              <code> {API_BASE}/api/public/v1/sites/SITE_ID/stream</code> con header
              <code> Authorization: Bearer TU_CLAVE</code>.</li>
            <li>Filtra los eventos <code>telemetry</code>.</li>
            <li>Nodo <code>mqtt out</code> publicando el payload JSON en tu broker, p. ej.
              <code> solar/casa/telemetry</code>.</li>
          </ol>
        </Section>

        {/* JavaScript ejemplo */}
        <Section title="Ejemplo JavaScript (EventSource)">
          <Pre>{`// Lectura puntual
const r = await fetch("${API_BASE}/api/public/v1/sites/SITE_ID/telemetry", {
  headers: { Authorization: "Bearer TU_CLAVE" }
});
const { telemetry } = await r.json();
console.log("PV:", telemetry.pv_input_power, "W");

// Stream en vivo (SSE)
const es = new EventSource("${API_BASE}/api/public/v1/sites/SITE_ID/stream?token=...", {
  // Nota: EventSource no permite headers; usa un proxy o fetch+ReadableStream
});`}</Pre>
        </Section>

        {/* Códigos */}
        <Section title="Códigos de respuesta">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-4">Código</th><th>Significado</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              <tr><td className="py-1 pr-4">200</td><td className="font-sans">OK</td></tr>
              <tr><td className="py-1 pr-4">401</td><td className="font-sans">Falta o es inválida la clave (revocada / mal formada)</td></tr>
              <tr><td className="py-1 pr-4">403</td><td className="font-sans">Clave válida pero sin acceso a ese sitio</td></tr>
              <tr><td className="py-1 pr-4">404</td><td className="font-sans">Sitio no encontrado</td></tr>
              <tr><td className="py-1 pr-4">5xx</td><td className="font-sans">Error temporal — reintenta con backoff</td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="Buenas prácticas">
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Usa <b>una clave por integración</b> (Home Assistant, Node-RED…) para poder revocarlas por separado.</li>
            <li>Para datos en vivo prefiere <code>/stream</code> en vez de hacer polling agresivo al endpoint <code>/telemetry</code>.</li>
            <li>El polling razonable a <code>/telemetry</code> es <b>cada 10–30 segundos</b>.</li>
            <li>CORS está habilitado (<code>*</code>) en todos los endpoints públicos.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      <div className="text-sm space-y-2">{children}</div>
    </div>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">{children}</pre>
  );
}

interface Param { name: string; in: "path" | "query" | "header"; type: string; required: boolean; desc: string }

function EndpointDoc({
  method, path, desc, params, response, curl, icon,
}: {
  method: string; path: string; desc: string;
  params: Param[]; response: string; curl: string; icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-background p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="font-mono">{method}</Badge>
        <code className="text-xs break-all">{API_BASE}{path}</code>
        {icon}
      </div>
      <p className="text-sm text-muted-foreground">{desc}</p>

      {params.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Parámetros</div>
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-1 pr-3">Nombre</th><th className="pr-3">En</th><th className="pr-3">Tipo</th><th className="pr-3">Req.</th><th>Descripción</th></tr>
            </thead>
            <tbody className="font-mono">
              {params.map((p) => (
                <tr key={p.name} className="border-t">
                  <td className="py-1 pr-3">{p.name}</td>
                  <td className="pr-3">{p.in}</td>
                  <td className="pr-3">{p.type}</td>
                  <td className="pr-3">{p.required ? "sí" : "no"}</td>
                  <td className="font-sans">{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Respuesta</div>
        <Pre>{response}</Pre>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Ejemplo curl</div>
        <Pre>{curl}</Pre>
      </div>
    </div>
  );
}
