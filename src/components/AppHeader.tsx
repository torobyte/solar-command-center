import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Sun, LogOut, Shield, LayoutGrid } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const { user, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const onSites = location.pathname.startsWith("/sites") || location.pathname === "/app";
  const onAdmin = location.pathname.startsWith("/admin");

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
            <Sun className="h-5 w-5 text-accent" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold tracking-tight">solar</span>
            <span className="text-lg font-light text-muted-foreground">ops</span>
          </div>
        </Link>

        {user && (
          <nav className="flex items-center gap-1">
            <Link to="/app">
              <Button variant={onSites ? "secondary" : "ghost"} size="sm">
                <LayoutGrid className="mr-2 h-4 w-4" /> Sites
              </Button>
            </Link>
            {role === "superadmin" && (
              <Link to="/admin">
                <Button variant={onAdmin ? "secondary" : "ghost"} size="sm">
                  <Shield className="mr-2 h-4 w-4" /> Admin
                </Button>
              </Link>
            )}
            <div className="mx-3 h-6 w-px bg-border" />
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        )}
      </div>
    </header>
  );
}
