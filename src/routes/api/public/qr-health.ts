import { createFileRoute } from "@tanstack/react-router";

// Public, data-free health check: proves a (legacy) QR domain still serves this app,
// so /i/<token> links on already printed labels keep working. Returns no private data.
export const Route = createFileRoute("/api/public/qr-health")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify({ ok: true, service: "renthub-qr" }), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        }),
    },
  },
});
