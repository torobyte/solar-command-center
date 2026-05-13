import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wrapper for the SolarOps web app.
 *
 * The mobile app is a thin shell that loads the published Lovable site.
 * This keeps the codebase single-source: every web update reaches the
 * phone immediately, without rebuilding the APK.
 *
 * The Android home-screen widget is a separate native module — see
 * `android-widget/` and `MOBILE.md`.
 */
const config: CapacitorConfig = {
  appId: "app.solarops.client",
  appName: "SolarOps",
  // No bundled web assets — we point straight at the published site.
  webDir: "dist",
  server: {
    url: "https://project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#0a0a0a",
  },
};

export default config;
