import { createFileRoute, Link } from "@tanstack/react-router";
import { Sun, Activity, Shield, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
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
          <div className="flex gap-2">
            <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/signup"><Button size="sm">Get started</Button></Link>
          </div>
        </div>
      </header>

      <section
        className="border-b"
        style={{ background: "var(--gradient-sun)" }}
      >
        <div className="mx-auto max-w-7xl px-6 py-24 text-primary">
          <h1 className="max-w-3xl text-5xl font-bold tracking-tight md:text-6xl">
            Monitor your solar inverter from anywhere.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-primary/80">
            SolarOps connects to Voltronic / Axpert inverters via Raspberry Pi or Orange Pi.
            Real-time dashboards, automatic port detection, and offline-first local access.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/signup"><Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">Create free account</Button></Link>
            <a href="#install"><Button size="lg" variant="outline" className="bg-background/80">How it works</Button></a>
          </div>
        </div>
      </section>

      <section id="install" className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            { icon: Cpu, title: "Auto-detect inverter", body: "The agent scans USB and serial ports and identifies your Voltronic inverter automatically." },
            { icon: Activity, title: "Real-time + history", body: "Power, battery, PV and grid metrics streamed to the cloud and aggregated daily." },
            { icon: Shield, title: "Local & secure", body: "Works offline on your LAN. Cloud sync uses signed device tokens." },
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
