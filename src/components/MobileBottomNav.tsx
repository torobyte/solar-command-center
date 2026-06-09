import { LayoutDashboard, LineChart, Calculator, BellRing, Settings2, Coins, Zap } from "lucide-react";

export type SiteTab = "dashboard" | "control" | "charts" | "totals" | "savings" | "notifications" | "config";

const items: { id: SiteTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "control", label: "Control", icon: Zap },
  { id: "charts", label: "Charts", icon: LineChart },
  { id: "totals", label: "Totales", icon: Calculator },
  { id: "savings", label: "Ahorro", icon: Coins },
  { id: "notifications", label: "Alertas", icon: BellRing },
  { id: "config", label: "Config", icon: Settings2 },
];

export function MobileBottomNav({ value, onChange, hideTabs }: { value: SiteTab; onChange: (v: SiteTab) => void; hideTabs?: SiteTab[] }) {
  const visible = items.filter((i) => !hideTabs?.includes(i.id));
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Site sections"
    >
      <div className="mx-auto max-w-screen-md px-3 pb-3 pt-2">
        <div className="glass-strong rounded-2xl border border-border/70 shadow-elevated">
          <ul className="grid" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}>
            {visible.map(({ id, label, icon: Icon }) => {
              const active = value === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onChange(id)}
                    className="group relative flex w-full flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[10.5px] font-medium"
                    aria-current={active ? "page" : undefined}
                  >
                    {active && (
                      <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gradient-aurora animate-fade-in" />
                    )}
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 ${
                        active
                          ? "bg-accent/15 text-accent scale-110 shadow-[0_4px_14px_-6px_color-mix(in_oklab,var(--accent)_60%,transparent)]"
                          : "text-muted-foreground group-hover:text-foreground group-active:scale-90"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                    </span>
                    <span className={`leading-none transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
