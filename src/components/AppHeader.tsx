import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Sun, LogOut, Shield, LayoutGrid, Menu, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LangSwitcher } from "@/components/LangSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function AppHeader() {
  const { user, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const onSites = location.pathname.startsWith("/sites") || location.pathname === "/app";
  const onAdmin = location.pathname.startsWith("/admin");

  const navLinks = (
    <>
      <Link to="/app" onClick={() => setOpen(false)}>
        <Button variant={onSites ? "secondary" : "ghost"} size="sm" className="w-full justify-start sm:w-auto sm:justify-center">
          <LayoutGrid className="mr-2 h-4 w-4" /> {t("nav.sites")}
        </Button>
      </Link>
      <Link to="/account" onClick={() => setOpen(false)}>
        <Button variant={location.pathname.startsWith("/account") ? "secondary" : "ghost"} size="sm" className="w-full justify-start sm:w-auto sm:justify-center">
          <UserIcon className="mr-2 h-4 w-4" /> Mi cuenta
        </Button>
      </Link>
      {role === "superadmin" && (
        <Link to="/admin" onClick={() => setOpen(false)}>
          <Button variant={onAdmin ? "secondary" : "ghost"} size="sm" className="w-full justify-start sm:w-auto sm:justify-center">
            <Shield className="mr-2 h-4 w-4" /> {t("nav.admin")}
          </Button>
        </Link>
      )}
    </>
  );

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
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
          <>
            {/* Desktop nav */}
            <nav className="hidden items-center gap-1 md:flex">
              {navLinks}
              <div className="mx-3 h-6 w-px bg-border" />
              <span className="hidden text-sm text-muted-foreground lg:inline">{user.email}</span>
              <LangSwitcher />
              <ThemeToggle />
              <Button variant="ghost" size="sm" title={t("nav.signOut")} onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
                <LogOut className="h-4 w-4" />
              </Button>
            </nav>

            {/* Mobile nav */}
            <div className="flex items-center gap-1 md:hidden">
              <ThemeToggle />
              <LangSwitcher />
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[80%] sm:w-80">
                  <SheetHeader>
                    <SheetTitle>SolarOps</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 flex flex-col gap-2">
                    {navLinks}
                    <div className="my-2 h-px bg-border" />
                    <div className="px-2 text-xs text-muted-foreground break-all">{user.email}</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 justify-start"
                      onClick={async () => { setOpen(false); await signOut(); navigate({ to: "/login" }); }}
                    >
                      <LogOut className="mr-2 h-4 w-4" /> {t("nav.signOut")}
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </>
        )}
        {!user && (
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LangSwitcher />
          </div>
        )}
      </div>
    </header>
  );
}
