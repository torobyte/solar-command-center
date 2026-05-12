import { createFileRoute, Link } from "@tanstack/react-router";
import { Sun, Activity, ShieldCheck, Cpu, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LangSwitcher } from "@/components/LangSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { t } = useI18n();
  return (
    <div className="ambient-bg min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 glass-strong">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-glow">
              <Sun className="h-5 w-5 text-accent" strokeWidth={2.4} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold tracking-tight text-gradient">solar</span>
              <span className="text-lg font-light text-muted-foreground">ops</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <LangSwitcher />
            <Link to="/login"><Button variant="ghost" size="sm" className="rounded-full">{t("landing.signIn")}</Button></Link>
            <Link to="/signup">
              <Button size="sm" className="rounded-full bg-gradient-to-r from-primary to-primary/80 shadow-glow">
                {t("landing.getStarted")} <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 -z-10 bg-gradient-aurora opacity-90 animate-gradient" style={{ animation: "gradient-shift 12s ease infinite" }} />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,white,transparent_60%)] opacity-30 dark:opacity-10" />
        <div className="absolute right-10 top-10 -z-0 hidden md:block">
          <Sun className="h-32 w-32 text-white/20 animate-spin-slow" style={{ animation: "spin 28s linear infinite" }} strokeWidth={1.4} />
        </div>
        <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur animate-fade-in">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.4} />
            <span>Energía solar inteligente</span>
          </div>
          <h1 className="mt-5 max-w-3xl text-5xl font-bold tracking-tight text-white drop-shadow md:text-6xl animate-fade-up">
            {t("landing.hero.title")}
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-white/90 animate-fade-up" style={{ animationDelay: "80ms" }}>
            {t("landing.hero.subtitle")}
          </p>
          <div className="mt-9 flex flex-wrap gap-3 animate-fade-up" style={{ animationDelay: "160ms" }}>
            <Link to="/signup">
              <Button size="lg" className="rounded-full bg-primary text-primary-foreground shadow-elevated hover:bg-primary/90">
                {t("landing.hero.cta")} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <a href="#install">
              <Button size="lg" variant="outline" className="rounded-full border-white/40 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white">
                {t("landing.hero.howItWorks")}
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section id="install" className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: Cpu, title: t("landing.feat1.title"), body: t("landing.feat1.body") },
            { icon: Activity, title: t("landing.feat2.title"), body: t("landing.feat2.body") },
            { icon: ShieldCheck, title: t("landing.feat3.title"), body: t("landing.feat3.body") },
          ].map((f, i) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border bg-card p-6 hover-lift animate-fade-up"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-aurora opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-30" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 text-accent ring-1 ring-accent/20">
                <f.icon className="h-6 w-6 icon-spring" strokeWidth={2.2} />
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
