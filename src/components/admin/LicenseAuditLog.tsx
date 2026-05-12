import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldOff, Trash2, KeyRound, Plus, RotateCcw } from "lucide-react";

interface AuditEntry {
  id: string;
  license_id: string | null;
  license_code: string | null;
  plan: string | null;
  action: string;
  performed_by_email: string | null;
  reason: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const ICONS: Record<string, React.ReactNode> = {
  created: <Plus className="h-3.5 w-3.5 text-success" />,
  revoked: <ShieldOff className="h-3.5 w-3.5 text-warning" />,
  deleted: <Trash2 className="h-3.5 w-3.5 text-destructive" />,
  activated: <KeyRound className="h-3.5 w-3.5 text-primary" />,
  reactivated: <RotateCcw className="h-3.5 w-3.5 text-success" />,
};

const LABELS: Record<string, string> = {
  created: "Creada",
  revoked: "Revocada",
  deleted: "Eliminada",
  activated: "Activada",
  reactivated: "Reactivada",
};

export function LicenseAuditLog() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  async function load() {
    const { data } = await supabase
      .from("license_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data ?? []) as AuditEntry[]);
  }
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (filter !== "all" && r.action !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.license_code?.toLowerCase().includes(s) &&
          !r.performed_by_email?.toLowerCase().includes(s) &&
          !r.reason?.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Buscar código, email o motivo…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-72"
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las acciones</SelectItem>
            <SelectItem value="created">Creada</SelectItem>
            <SelectItem value="activated">Activada</SelectItem>
            <SelectItem value="revoked">Revocada</SelectItem>
            <SelectItem value="deleted">Eliminada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Acción</th>
              <th className="px-4 py-3 font-medium">Licencia</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Por</th>
              <th className="px-4 py-3 font-medium">Motivo</th>
              <th className="px-4 py-3 font-medium">Cuándo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    {ICONS[r.action] ?? null}
                    {LABELS[r.action] ?? r.action}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{r.license_code ?? "—"}</td>
                <td className="px-4 py-3">{r.plan ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.performed_by_email ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.reason ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground" title={r.created_at}>
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">Sin actividad registrada.</p>
        )}
      </div>
    </>
  );
}
