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
      <div className="ambient-bg flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="ambient-bg min-h-screen bg-background">
      <AppHeader />
      <main className="w-full animate-fade-up px-4 py-6 sm:px-8 sm:py-8 lg:px-12">{children}</main>
      <RealtimeStatusMonitor />
    </div>
  );
}
