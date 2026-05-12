import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { BrandingProvider } from "@/lib/branding";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página no encontrada / Page not found</h2>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Inicio / Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#f59e0b" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { title: "SolarOps — Monitor your solar inverter" },
      { name: "description", content: "Monitor and manage Voltronic / Axpert solar inverters from anywhere." },
      { property: "og:title", content: "SolarOps — Monitor your solar inverter" },
      { name: "twitter:title", content: "SolarOps — Monitor your solar inverter" },
      { property: "og:description", content: "Monitor and manage Voltronic / Axpert solar inverters from anywhere." },
      { name: "twitter:description", content: "Monitor and manage Voltronic / Axpert solar inverters from anywhere." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a805cb56-f6e9-448c-8953-daa372ddcd7c/id-preview-55a3a77c--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app-1778523485162.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a805cb56-f6e9-448c-8953-daa372ddcd7c/id-preview-55a3a77c--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app-1778523485162.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/api/public/manifest" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <BrandingProvider>
          <AuthProvider>
            <Outlet />
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </BrandingProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
