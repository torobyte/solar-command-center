// Sirve el script de auto-actualización del agente.
import { createFileRoute } from "@tanstack/react-router";
import updateScript from "../../../../agent/update.sh?raw";

export const Route = createFileRoute("/api/public/agent/update")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(updateScript as string, {
          headers: {
            "content-type": "text/x-shellscript; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
