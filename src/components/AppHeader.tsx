import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Sun, LogOut, ShieldCheck, LayoutGrid, Menu, UserCircle2, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useBranding } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { LangSwitcher } from "@/components/LangSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function AppHeader() {
  const { user, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { branding, resolvedLogo } = useBranding();
  const [open, setOpen] = useState(false);
  const siteName = branding?.site_name ?? "Mi plataforma";
  const logoUrl = resolvedLogo;

  const onSites = location.pathname.startsWith("/sites") || location.pathname === "/app";
  const onAdmin = location.pathname.startsWith("/admin");
  const onAccount = location.pathname.startsWith("/account");

  type NavItem = { to: string; label: string; icon: typeof LayoutGrid; active: boolean };
  const items: NavItem[] = [
    { to: "/app", label: t("nav.sites"), icon: LayoutGrid, active: onSites },
    { to: "/account", label: "Mi cuenta", icon: UserCircle2, active: onAccount },
  ];
  if (role === "superadmin") {
    items.push({ to: "/admin", label: t("nav.admin"), icon: ShieldCheck, active: onAdmin });
  }

  const renderNavLink = (it: NavItem, mobile = false) => (
    <Link key={it.to} to={it.to} onClick={() => mobile && setOpen(false)} className="group">
      <div
        className={`relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
          it.active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        } ${mobile ? "w-full justify-start" : ""}`}
      >
        <it.icon className="h-4 w-4" strokeWidth={2.2} />
        <span>{it.label}</span>
        {it.active && !mobile && (
          <span className="absolute -bottom-[10px] left-1/2 h-[3px] w-10 -translate-x-1/2 rounded-full bg-primary" />
        )}
      </div>
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
      <div className="flex h-16 w-full items-center justify-between px-4 sm:px-8 lg:px-12">
        <Link to={user ? "/app" : "/"} className="group flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={siteName} className="h-10 max-w-[180px] object-contain" />
          ) : (
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-sm">
              <Sun className="h-5 w-5 text-white" strokeWidth={2.4} />
              <Sparkles className="absolute -right-1 -top-1 h-3 w-3 text-accent opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={2.4} />
            </div>
          )}
          {!logoUrl && (
            <div className="flex flex-col leading-none">
              <span className="text-lg font-extrabold tracking-tight text-foreground">{siteName}</span>
              <span className="text-[10px] font-semibold tracking-[0.18em] text-primary">SOLAR MONITOR</span>
            </div>
          )}
        </Link>

        {user && (
          <>
            <nav className="hidden items-center gap-1 md:flex">
              {items.map((it) => renderNavLink(it))}
              <div className="mx-3 h-6 w-px bg-border" />
              <span className="hidden max-w-[180px] truncate text-sm text-muted-foreground lg:inline">{user.email}</span>
              <LangSwitcher />
              <ThemeToggle />
              <Button variant="ghost" size="icon" title={t("nav.signOut")} onClick={async () => { await signOut(); navigate({ to: "/login" }); }} className="rounded-full hover:bg-destructive/10 hover:text-destructive">
                <LogOut className="h-4 w-4" strokeWidth={2.2} />
              </Button>
            </nav>

            <div className="flex items-center gap-1 md:hidden">
              <ThemeToggle />
              <LangSwitcher />
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Menu" className="rounded-full">
                    <Menu className="h-5 w-5" strokeWidth={2.2} />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[82%] sm:w-80 glass-strong">
                  <SheetHeader>
                    <SheetTitle className="text-gradient text-xl">{siteName}</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 flex flex-col gap-1.5">
                    {items.map((it) => renderNavLink(it, true))}
                    <div className="my-3 h-px bg-border" />
                    <div className="px-3 text-xs text-muted-foreground break-all">{user.email}</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 justify-start rounded-full"
                      onClick={async () => { setOpen(false); await signOut(); navigate({ to: "/login" }); }}
                    >
                      <LogOut className="mr-2 h-4 w-4" strokeWidth={2.2} /> {t("nav.signOut")}
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
