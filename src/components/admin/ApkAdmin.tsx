import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getApkConfig, saveApkConfig, generateApkProject } from "@/lib/apk.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, Download, Smartphone, RefreshCw, Upload, X } from "lucide-react";

interface ApkConfig {
  app_id: string;
  app_name: string;
  version_name: string;
  version_code: number;
  server_url: string;
  primary_color: string;
  background_color: string;
  splash_color: string;
  status_bar_style: "light" | "dark";
  icon_url: string | null;
  splash_url: string | null;
  enable_push: boolean;
  cleartext: boolean;
}

const DEFAULT: ApkConfig = {
  app_id: "app.solarops.client",
  app_name: "SolarOps",
  version_name: "1.0.0",
  version_code: 1,
  server_url: "https://project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app",
  primary_color: "#f59e0b",
  background_color: "#0a0a0a",
  splash_color: "#0a0a0a",
  status_bar_style: "dark",
  icon_url: null,
  splash_url: null,
  enable_push: true,
  cleartext: false,
};

export function ApkAdmin() {
  const fetchCfg = useServerFn(getApkConfig);
  const saveCfg = useServerFn(saveApkConfig);
  const genProj = useServerFn(generateApkProject);
  const [cfg, setCfg] = useState<ApkConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchCfg();
        if (r.config) setCfg({ ...DEFAULT, ...r.config });
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    setShowSplash(true);
    const t = setTimeout(() => setShowSplash(false), 1500);
    return () => clearTimeout(t);
  }, [previewKey]);

  const update = <K extends keyof ApkConfig>(k: K, v: ApkConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  const onSave = async () => {
    setSaving(true);
    try {
      await saveCfg({ data: cfg });
      toast.success("Configuración guardada");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const onDownload = async () => {
    setDownloading(true);
    try {
      const r = await genProj();
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("Proyecto Android descargado");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</div>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card className="p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><Smartphone className="h-5 w-5" />Configuración APK Android</h3>
          <p className="text-sm text-muted-foreground">Modifica la app móvil en tiempo real, previsualízala y descarga el proyecto listo para Android Studio.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nombre de la app</Label>
            <Input value={cfg.app_name} onChange={(e) => update("app_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Package ID</Label>
            <Input value={cfg.app_id} onChange={(e) => update("app_id", e.target.value)} placeholder="app.miempresa.cliente" />
          </div>
          <div className="space-y-2">
            <Label>Versión (versionName)</Label>
            <Input value={cfg.version_name} onChange={(e) => update("version_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Versión código (versionCode)</Label>
            <Input type="number" value={cfg.version_code} onChange={(e) => update("version_code", parseInt(e.target.value || "1"))} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>URL del servidor (web app que carga la APK)</Label>
            <Input value={cfg.server_url} onChange={(e) => update("server_url", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Color primario</Label>
            <div className="flex gap-2">
              <input type="color" value={cfg.primary_color} onChange={(e) => update("primary_color", e.target.value)} className="h-10 w-14 rounded border" />
              <Input value={cfg.primary_color} onChange={(e) => update("primary_color", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Color de fondo</Label>
            <div className="flex gap-2">
              <input type="color" value={cfg.background_color} onChange={(e) => update("background_color", e.target.value)} className="h-10 w-14 rounded border" />
              <Input value={cfg.background_color} onChange={(e) => update("background_color", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Color splash</Label>
            <div className="flex gap-2">
              <input type="color" value={cfg.splash_color} onChange={(e) => update("splash_color", e.target.value)} className="h-10 w-14 rounded border" />
              <Input value={cfg.splash_color} onChange={(e) => update("splash_color", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status bar</Label>
            <Select value={cfg.status_bar_style} onValueChange={(v) => update("status_bar_style", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Iconos oscuros (fondo claro)</SelectItem>
                <SelectItem value="light">Iconos claros (fondo oscuro)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Ícono (URL PNG 1024×1024)</Label>
            <Input value={cfg.icon_url ?? ""} onChange={(e) => update("icon_url", e.target.value || null)} placeholder="https://…/icon.png" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Splash (URL PNG 2732×2732)</Label>
            <Input value={cfg.splash_url ?? ""} onChange={(e) => update("splash_url", e.target.value || null)} placeholder="https://…/splash.png" />
          </div>

          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <div className="font-medium text-sm">Push notifications</div>
              <div className="text-xs text-muted-foreground">Incluye @capacitor/push-notifications</div>
            </div>
            <Switch checked={cfg.enable_push} onCheckedChange={(v) => update("enable_push", v)} />
          </div>
          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <div className="font-medium text-sm">Permitir HTTP (cleartext)</div>
              <div className="text-xs text-muted-foreground">Solo para desarrollo</div>
            </div>
            <Switch checked={cfg.cleartext} onCheckedChange={(v) => update("cleartext", v)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Guardar cambios
          </Button>
          <Button variant="secondary" onClick={() => setPreviewKey((k) => k + 1)}>
            <RefreshCw className="h-4 w-4 mr-2" />Refrescar preview
          </Button>
          <Button variant="default" onClick={onDownload} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Descargar proyecto Android (.zip)
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        <Label className="text-sm">Vista previa móvil</Label>
        <div
          className="mx-auto rounded-[2.5rem] p-3 shadow-2xl"
          style={{ width: 340, background: "#111", border: "1px solid #333" }}
        >
          <div
            className="relative rounded-[2rem] overflow-hidden"
            style={{ height: 640, background: cfg.background_color }}
          >
            <div
              className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-2 text-[11px] font-medium"
              style={{
                background: cfg.background_color,
                color: cfg.status_bar_style === "light" ? "#fff" : "#000",
              }}
            >
              <span>9:41</span>
              <span className="h-5 w-20 rounded-full" style={{ background: "#000" }} />
              <span>100%</span>
            </div>

            {showSplash ? (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center"
                style={{ background: cfg.splash_color }}
              >
                {cfg.icon_url ? (
                  <img src={cfg.icon_url} alt="" className="h-20 w-20 rounded-2xl" />
                ) : (
                  <div
                    className="h-20 w-20 rounded-2xl flex items-center justify-center text-2xl font-bold"
                    style={{ background: cfg.primary_color, color: "#fff" }}
                  >
                    {cfg.app_name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="mt-4 text-sm" style={{ color: cfg.status_bar_style === "light" ? "#fff" : "#fff" }}>
                  {cfg.app_name}
                </div>
              </div>
            ) : (
              <iframe
                key={previewKey}
                src={cfg.server_url}
                title="preview"
                className="absolute inset-0 h-full w-full border-0 pt-7"
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          {cfg.app_name} · v{cfg.version_name} ({cfg.version_code})
        </p>
      </div>
    </div>
  );
}
