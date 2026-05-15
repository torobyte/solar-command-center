// Sirve el script de instalación del agente embebido en el bundle.
// Uso desde Raspberry/Orange Pi:
//   curl -fsSL https://<host>/api/public/agent/install | sudo bash
import { createFileRoute } from "@tanstack/react-router";
import installScript from "../../../../agent/install.sh?raw";

export const Route = createFileRoute("/api/public/agent/install")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(installScript as string, {
          headers: {
            "content-type": "text/x-shellscript; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
