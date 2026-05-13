import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { Loader2 } from "lucide-react";
import { RealtimeStatusMonitor } from "@/components/RealtimeStatusMonitor";

export function ProtectedLayout({
  children,
  requireRole,
}: {
  children: ReactNode;
  requireRole?: "superadmin";
}) {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (requireRole === "superadmin" && role !== "superadmin") navigate({ to: "/app" });
  }, [user, role, loading, requireRole, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="ambient-bg min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl animate-fade-up px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <RealtimeStatusMonitor />
    </div>
  );
}
