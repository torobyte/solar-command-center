import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { acceptSiteInvitation, getInvitationInfo } from "@/lib/sharing.functions";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Mail, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/invite/$token")({
  component: () => <ProtectedLayout><InvitePage /></ProtectedLayout>,
});

interface Info {
  found: boolean;
  site_name?: string;
  email?: string;
  role?: string;
  expired?: boolean;
  accepted?: boolean;
}

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const accept = useServerFn(acceptSiteInvitation);
  const getInfo = useServerFn(getInvitationInfo);
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getInfo({ data: { token } }).then((r) => setInfo(r as Info)).catch(() => setInfo({ found: false }));
  }, [token, getInfo]);

  async function onAccept() {
    setBusy(true);
    try {
      const r = await accept({ data: { token } });
      toast.success("¡Invitación aceptada!");
      navigate({ to: "/sites/$siteId", params: { siteId: r.site_id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!info) return <p className="text-sm text-muted-foreground">Cargando invitación…</p>;

  if (!info.found) {
    return (
      <Card icon={<AlertCircle className="h-8 w-8 text-destructive" />} title="Invitación no encontrada">
        El link es inválido o fue revocado.
      </Card>
    );
  }
  if (info.accepted) {
    return (
      <Card icon={<CheckCircle2 className="h-8 w-8 text-success" />} title="Invitación ya usada">
        Esta invitación ya fue aceptada anteriormente.
      </Card>
    );
  }
  if (info.expired) {
    return (
      <Card icon={<AlertCircle className="h-8 w-8 text-warning" />} title="Invitación expirada">
        Pídele al propietario que te genere una nueva.
      </Card>
    );
  }

  return (
    <Card icon={<Mail className="h-8 w-8 text-accent" />} title={`Te invitaron a ${info.site_name}`}>
      <p className="mb-4">
        Aceptarás como <b>{info.role}</b> con el email <b>{info.email}</b>.
      </p>
      <Button onClick={onAccept} disabled={busy} className="w-full rounded-full">
        {busy ? "Aceptando…" : "Aceptar invitación"}
      </Button>
    </Card>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md mt-12 rounded-2xl border bg-card p-6 text-center shadow-sm animate-fade-up">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">{icon}</div>
      <h2 className="mb-2 text-xl font-bold">{title}</h2>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
