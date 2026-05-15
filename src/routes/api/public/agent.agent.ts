// Sirve el código Python del agente local para instalación y auto-actualización.
import { createFileRoute } from "@tanstack/react-router";
import agentPy from "../../../../agent/agent.py?raw";

export const Route = createFileRoute("/api/public/agent/agent")({
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
