// Sirve el código Python del agente local. El instalador y el auto-updater lo descargan.
import { createFileRoute } from "@tanstack/react-router";
import agentPy from "../../../../agent/agent.py?raw";

export const Route = createFileRoute("/api/public/agent/py")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(agentPy as string, {
          headers: {
            "content-type": "text/x-python; charset=utf-8",
            "cache-control": "no-store",
            etag: `"${(agentPy as string).length}"`,
          },
        });
      },
    },
  },
});
