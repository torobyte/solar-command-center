import { LayoutDashboard, BarChart3, Calculator, Bell, Settings } from "lucide-react";

export type SiteTab = "dashboard" | "charts" | "totals" | "notifications" | "config";

const items: { id: SiteTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "charts", label: "Charts", icon: BarChart3 },
  { id: "totals", label: "Totales", icon: Calculator },
  { id: "notifications", label: "Alertas", icon: Bell },
  { id: "config", label: "Config", icon: Settings },
];

export function MobileBottomNav({ value, onChange }: { value: SiteTab; onChange: (v: SiteTab) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Site sections"
    >
      <ul className="mx-auto grid max-w-screen-md grid-cols-5">
        {items.map(({ id, label, icon: Icon }) => {
          const active = value === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onChange(id)}
                className={`flex w-full flex-col items-center gap-0.5 px-1 py-2 text-[11px] transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={`h-5 w-5 ${active ? "scale-110" : ""} transition-transform`} />
                <span className="leading-none">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
