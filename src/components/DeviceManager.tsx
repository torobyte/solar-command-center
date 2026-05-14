import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Cpu } from "lucide-react";

export interface Device {
  id: string;
  site_id: string;
  name: string;
  model: string | null;
  serial_number: string | null;
  driver: string | null;
  is_primary: boolean;
  sort_order: number;
}

const STORAGE_PREFIX = "selected.device.v1.";

export function useDevices(siteId: string) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const { data } = await supabase
      .from("devices")
      .select("*")
      .eq("site_id", siteId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    const list = (data ?? []) as Device[];
    setDevices(list);
    setLoaded(true);
    setSelectedId((cur) => {
      const stored = typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_PREFIX + siteId) : null;
      const valid = list.find((d) => d.id === cur || d.id === stored);
      return valid?.id ?? list.find((d) => d.is_primary)?.id ?? list[0]?.id ?? null;
    });
  }

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`devices-${siteId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "devices", filter: `site_id=eq.${siteId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  function select(id: string) {
    setSelectedId(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_PREFIX + siteId, id);
  }

  const selected = devices.find((d) => d.id === selectedId) ?? null;
  return { devices, selected, selectedId, select, loaded, refresh };
}

export function DeviceSelector({ siteId }: { siteId: string }) {
  const { devices, selectedId, select } = useDevices(siteId);
  const [specModel, setSpecModel] = useState<string | null>(null);
  const [specSerial, setSpecSerial] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("inverter_specs")
        .select("model_name,serial_number")
        .eq("site_id", siteId)
        .maybeSingle();
      if (!cancelled) {
        setSpecModel((data?.model_name as string | null) ?? null);
        setSpecSerial((data?.serial_number as string | null) ?? null);
      }
    })();
    const ch = supabase
      .channel(`specs-${siteId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inverter_specs", filter: `site_id=eq.${siteId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { model_name?: string | null; serial_number?: string | null } | null;
          if (row) {
            setSpecModel(row.model_name ?? null);
            setSpecSerial(row.serial_number ?? null);
          }
        }
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [siteId]);

  const connectedName = specModel || devices.find((d) => d.id === selectedId)?.model || devices[0]?.name || "Sin inversor conectado";

  return (
    <div className="rounded-2xl border bg-card/60 p-3 backdrop-blur-sm sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Cpu className="h-3.5 w-3.5" strokeWidth={2.2} /> Inversor conectado
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{connectedName}</div>
          {specSerial && (
            <div className="truncate text-[11px] text-muted-foreground">S/N {specSerial}</div>
          )}
        </div>
        {devices.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {devices.map((d) => (
              <button
                key={d.id}
                onClick={() => select(d.id)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                  d.id === selectedId
                    ? "border-accent/60 bg-accent/15 text-accent shadow-sm"
                    : "border-border/60 bg-background text-foreground/80 hover:bg-muted",
                ].join(" ")}
                title={d.model ?? ""}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
