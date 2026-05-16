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
import { Loader2, Save, Download, Smartphone, RefreshCw, Upload, X, Github, QrCode, ShieldCheck, Copy, CheckCircle2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface ApkConfig {
  app_id: string;
  app_name: string;
  version_name: string;
  version_code: number;
  server_url: string;
  start_path: string;
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
  start_path: "/apk-auth",
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
  const [apkUrl, setApkUrl] = useState<string>(() => localStorage.getItem("apk_download_url") ?? "");
  const [repoUrl, setRepoUrl] = useState<string>(() => localStorage.getItem("apk_repo_url") ?? "");
  const [latestTag, setLatestTag] = useState<string | null>(null);
  const [latestSha, setLatestSha] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [fetchingRelease, setFetchingRelease] = useState(false);
  const [autoMode, setAutoMode] = useState<boolean>(() => localStorage.getItem("apk_auto_mode") !== "false");
  const [copiedSha, setCopiedSha] = useState(false);

  function parseRepo(url: string): { owner: string; repo: string } | null {
    const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
    return m ? { owner: m[1], repo: m[2].replace(/\.git$/, "") } : null;
  }

  async function fetchLatestRelease(silent = false) {
    const parsed = parseRepo(repoUrl);
    if (!parsed) {
      if (!silent) toast.error("Configura primero la URL del repo de GitHub");
      return;
    }
    setFetchingRelease(true);
    try {
      const r = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!r.ok) throw new Error(`GitHub API ${r.status}`);
      const j = await r.json();
      const apkAsset = (j.assets ?? []).find((a: any) => a.name.endsWith(".apk"));
      const shaAsset = (j.assets ?? []).find((a: any) => a.name.endsWith(".sha256"));
      if (!apkAsset) throw new Error("El último release no contiene .apk");
      if (autoMode) {
        setApkUrl(apkAsset.browser_download_url);
        localStorage.setItem("apk_download_url", apkAsset.browser_download_url);
      }
      setLatestTag(j.tag_name ?? null);
      setPublishedAt(j.published_at ?? null);
      // Intenta extraer SHA del body, o descargar el .sha256
      const bodyMatch = (j.body ?? "").match(/[A-Fa-f0-9]{64}/);
      if (bodyMatch) setLatestSha(bodyMatch[0].toLowerCase());
      else if (shaAsset) {
        try {
          const t = await (await fetch(shaAsset.browser_download_url)).text();
          const m = t.match(/[A-Fa-f0-9]{64}/);
          if (m) setLatestSha(m[0].toLowerCase());
        } catch {}
      }
      if (!silent) toast.success(`Última versión: ${j.tag_name}`);
    } catch (e: any) {
      if (!silent) toast.error(e.message);
    } finally {
      setFetchingRelease(false);
    }
  }

  // Auto-fetch al cargar y cuando cambie el repo
  useEffect(() => {
    if (repoUrl && autoMode) fetchLatestRelease(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoUrl, autoMode]);

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="p-6 space-y-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2"><Smartphone className="h-5 w-5" />Configuración APK Android</h3>
            <p className="text-sm text-muted-foreground mt-1">Estos valores se aplican automáticamente al APK en el próximo build de GitHub Actions.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onSave} disabled={saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPreviewKey((k) => k + 1)}>
              <RefreshCw className="h-4 w-4 mr-2" />Preview
            </Button>
            <Button variant="default" size="sm" onClick={onDownload} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              .zip
            </Button>
          </div>
        </div>

        {/* Identidad */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Identidad</h4>
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
              <Label>versionName</Label>
              <Input value={cfg.version_name} onChange={(e) => update("version_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>versionCode</Label>
              <Input type="number" value={cfg.version_code} onChange={(e) => update("version_code", parseInt(e.target.value || "1"))} />
            </div>
          </div>
        </section>

        {/* URL y navegación */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">URL y navegación</h4>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL del servidor</Label>
              <Input value={cfg.server_url} onChange={(e) => update("server_url", e.target.value)} />
              <p className="text-xs text-muted-foreground">Dominio principal que sirve la app web.</p>
            </div>
            <div className="space-y-2">
              <Label>Ruta inicial</Label>
              <Input value={cfg.start_path} onChange={(e) => update("start_path", e.target.value)} placeholder="/apk-auth" />
              <p className="text-xs text-muted-foreground">La app abre en <code>{cfg.server_url.replace(/\/$/,"")}{cfg.start_path}</code>. La ruta <code>/apk-auth</code> sincroniza la sesión nativa y luego entra a <code>/app</code> o <code>/app-login</code>.</p>
            </div>
          </div>
        </section>

        {/* Apariencia */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Apariencia</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        </section>

        {/* Recursos gráficos */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recursos gráficos</h4>
          <div className="space-y-4">
            <AssetUploader
              label="Ícono del launcher (PNG cuadrado, 1024×1024)"
              value={cfg.icon_url}
              folder="icons"
              onChange={(url) => update("icon_url", url)}
            />
            <AssetUploader
              label="Splash (PNG cuadrado, 2732×2732)"
              value={cfg.splash_url}
              folder="splash"
              onChange={(url) => update("splash_url", url)}
            />
          </div>
        </section>

        {/* Avanzado */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Avanzado</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium text-sm">Push notifications</div>
                <div className="text-xs text-muted-foreground">Incluye @capacitor/push-notifications</div>
              </div>
              <Switch checked={cfg.enable_push} onCheckedChange={(v) => update("enable_push", v)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium text-sm">Permitir HTTP (cleartext)</div>
                <div className="text-xs text-muted-foreground">Solo para desarrollo</div>
              </div>
              <Switch checked={cfg.cleartext} onCheckedChange={(v) => update("cleartext", v)} />
            </div>
          </div>
        </section>
      </Card>


      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-accent" />
          <h3 className="text-lg font-semibold">Descarga del APK por QR</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          El APK se compila automáticamente con GitHub Actions: en cada push a <code>main</code>, todos los días a las 04:00 UTC, o manualmente desde Actions. El admin descubre la última versión del repo y genera el QR sin pegar nada a mano.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Repositorio GitHub</Label>
            <Input
              placeholder="https://github.com/usuario/repo"
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value);
                localStorage.setItem("apk_repo_url", e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm flex items-center justify-between">
              <span>URL del APK</span>
              <label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <Switch
                  checked={autoMode}
                  onCheckedChange={(v) => {
                    setAutoMode(v);
                    localStorage.setItem("apk_auto_mode", String(v));
                  }}
                />
                Auto desde Releases
              </label>
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Se rellena automáticamente"
                value={apkUrl}
                disabled={autoMode}
                onChange={(e) => {
                  setApkUrl(e.target.value);
                  localStorage.setItem("apk_download_url", e.target.value);
                }}
              />
              <Button size="sm" variant="outline" onClick={() => fetchLatestRelease(false)} disabled={fetchingRelease || !repoUrl}>
                {fetchingRelease ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {apkUrl ? (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG value={apkUrl} size={180} level="M" />
              </div>
              <div className="flex-1 space-y-3 text-sm">
                {latestTag && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">{latestTag}</span>
                    {publishedAt && (
                      <span className="text-muted-foreground">publicado {new Date(publishedAt).toLocaleString()}</span>
                    )}
                  </div>
                )}
                <p className="text-muted-foreground">
                  Escanea desde el móvil para descargar e instalar el APK firmado.
                </p>
                <div className="break-all rounded-md bg-muted/50 p-2 font-mono text-xs">{apkUrl}</div>
                {latestSha && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      SHA-256 (verificación de firma)
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 break-all rounded bg-muted/50 p-1.5 font-mono text-[10px]">{latestSha}</code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(latestSha);
                          setCopiedSha(true);
                          setTimeout(() => setCopiedSha(false), 1500);
                        }}
                      >
                        {copiedSha ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="default" asChild>
                    <a href={apkUrl} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 mr-2" />Abrir URL de instalación
                    </a>
                  </Button>
                  {repoUrl && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={`${repoUrl.replace(/\/$/, "")}/actions/workflows/build-apk.yml`} target="_blank" rel="noopener noreferrer">
                        <Github className="h-4 w-4 mr-2" />Lanzar build
                      </a>
                    </Button>
                  )}
                  {repoUrl && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`${repoUrl.replace(/\/$/, "")}/releases`} target="_blank" rel="noopener noreferrer">
                        Ver releases
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <details className="rounded-lg border border-border bg-muted/30 p-4 text-sm" open>
              <summary className="cursor-pointer font-medium">📲 Cómo instalar el APK en tu teléfono</summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
                <li>Escanea el código QR con la cámara del móvil (o pulsa <strong>Abrir URL de instalación</strong> si ya estás en el teléfono).</li>
                <li>El navegador descarga <code>app-release-signed.apk</code>. Acepta la descarga.</li>
                <li>Android pedirá permitir instalación desde esta fuente: <strong>Ajustes → Permitir esta instalación</strong> y vuelve atrás.</li>
                <li>Pulsa <strong>Instalar</strong>. Si Play Protect avisa "App no reconocida", pulsa <strong>Instalar de todas formas</strong> (el APK está firmado con tu keystore).</li>
                <li>
                  <strong>Verificar firma (opcional):</strong> compara el SHA-256 mostrado arriba con el del archivo descargado.
                  En Termux o un PC: <code>sha256sum app-release-signed.apk</code>. Los dos valores deben coincidir.
                </li>
                <li>Abre la app y entra con tu correo y contraseña.</li>
              </ol>
            </details>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {repoUrl
              ? "No se encontró ningún release todavía. Lanza el workflow desde Actions o haz un push a main."
              : "Pega la URL del repo de GitHub para detectar el último APK automáticamente."}
          </div>
        )}

        <details className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <summary className="cursor-pointer font-medium">⚙️ Configuración inicial (una sola vez)</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>Conecta el proyecto a GitHub desde el menú (+) → GitHub → Connect project.</li>
            <li>El workflow <code>.github/workflows/build-apk.yml</code> ya está incluido. Se ejecuta en cada push a <code>main</code>, todos los días a las 04:00 UTC, y manualmente desde la pestaña Actions.</li>
            <li>
              <strong>Firma del APK (requerida para instalar):</strong> añade estos Secrets en
              GitHub (Settings → Secrets and variables → Actions):
              <ul className="mt-1 list-disc pl-5">
                <li><code>ANDROID_KEYSTORE_BASE64</code> — keystore .jks en base64</li>
                <li><code>ANDROID_KEYSTORE_PASSWORD</code></li>
                <li><code>ANDROID_KEY_ALIAS</code></li>
                <li><code>ANDROID_KEY_PASSWORD</code></li>
              </ul>
            </li>
            <li>Genera el keystore con: <code>keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias solarops</code> y luego <code>base64 -w0 release.jks</code>.</li>
            <li>Pega arriba la URL del repo. El admin descubrirá el último APK automáticamente y mostrará SHA-256 para verificar la firma.</li>
          </ol>
        </details>
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
                src={typeof window !== "undefined" ? window.location.origin : "/"}
                title="preview"
                className="absolute inset-0 h-full w-full border-0 pt-7"
              />
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          {cfg.app_name} · v{cfg.version_name} ({cfg.version_code})
        </p>
        <p className="text-[10px] text-muted-foreground text-center break-all">
          URL empaquetada en APK: {cfg.server_url}
        </p>
      </div>
    </div>
  );
}

function AssetUploader({
  label,
  value,
  folder,
  onChange,
}: {
  label: string;
  value: string | null;
  folder: string;
  onChange: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onPick = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecciona una imagen PNG o JPG");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Máximo 5 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("apk-assets").upload(path, file, {
        upsert: false,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("apk-assets").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Imagen subida");
    } catch (e: any) {
      toast.error(e.message || "Error al subir");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative h-16 w-16 rounded-lg border overflow-hidden bg-muted">
            <img src={value} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute -top-1 -right-1 rounded-full bg-destructive text-destructive-foreground p-0.5"
              aria-label="Quitar"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="h-16 w-16 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground text-xs">
            Sin imagen
          </div>
        )}
        <div className="flex-1 space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
              e.target.value = "";
            }}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Upload className="h-3 w-3 mr-2" />}
              Subir archivo
            </Button>
          </div>
          <Input
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder="o pega una URL https://…"
            className="text-xs"
          />
        </div>
      </div>
    </div>
  );
}
