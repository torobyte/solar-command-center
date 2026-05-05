import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { Loader2 } from "lucide-react";

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
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
