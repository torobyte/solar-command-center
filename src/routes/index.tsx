import { createFileRoute, Link } from "@tanstack/react-router";
import { Sun, Activity, Shield, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LangSwitcher } from "@/components/LangSwitcher";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
              <Sun className="h-5 w-5 text-accent" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold">solar</span>
              <span className="text-lg font-light text-muted-foreground">ops</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LangSwitcher />
            <Link to="/login"><Button variant="ghost" size="sm">{t("landing.signIn")}</Button></Link>
            <Link to="/signup"><Button size="sm">{t("landing.getStarted")}</Button></Link>
          </div>
        </div>
      </header>

      <section className="border-b" style={{ background: "var(--gradient-sun)" }}>
        <div className="mx-auto max-w-7xl px-6 py-24 text-primary">
          <h1 className="max-w-3xl text-5xl font-bold tracking-tight md:text-6xl">{t("landing.hero.title")}</h1>
          <p className="mt-6 max-w-2xl text-lg text-primary/80">{t("landing.hero.subtitle")}</p>
          <div className="mt-8 flex gap-3">
            <Link to="/signup"><Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">{t("landing.hero.cta")}</Button></Link>
            <a href="#install"><Button size="lg" variant="outline" className="bg-background/80">{t("landing.hero.howItWorks")}</Button></a>
          </div>
        </div>
      </section>

      <section id="install" className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            { icon: Cpu, title: t("landing.feat1.title"), body: t("landing.feat1.body") },
            { icon: Activity, title: t("landing.feat2.title"), body: t("landing.feat2.body") },
            { icon: Shield, title: t("landing.feat3.title"), body: t("landing.feat3.body") },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/15 text-accent">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
