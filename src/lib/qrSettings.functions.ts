import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeBaseUrl } from "@/lib/unitUrls";

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|\d+\.\d+\.\d+\.\d+|\[.*\])$/i;

/**
 * Admin-only: checks that each QR domain still serves this app (GET <domain>/api/public/qr-health).
 * At most 10 https domains per call, public hostnames only, one check per 30 s (app_settings.qr_last_check_at).
 */
export const checkQrDomains = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { domains: string[] }) =>
    z.object({ domains: z.array(z.string().max(200)).max(10) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("forbidden");
    const { data: settings } = await context.supabase
      .from("app_settings")
      .select("qr_last_check_at")
      .maybeSingle();
    const last = settings?.qr_last_check_at ? new Date(settings.qr_last_check_at).getTime() : 0;
    if (Date.now() - last < 30_000) throw new Error("rate_limited");
    await context.supabase
      .from("app_settings")
      .update({ qr_last_check_at: new Date().toISOString() })
      .eq("id", true);

    return Promise.all(
      data.domains.map(async (raw) => {
        const base = normalizeBaseUrl(raw);
        if (!base || base.startsWith("http://") || PRIVATE_HOST.test(new URL(base).hostname)) {
          return { domain: raw, ok: false, detail: "invalid domain" };
        }
        try {
          const res = await fetch(`${base}/api/public/qr-health`, {
            redirect: "follow",
            signal: AbortSignal.timeout(6000),
          });
          const body = res.ok
            ? ((await res.json().catch(() => null)) as { service?: string } | null)
            : null;
          const ok = body?.service === "renthub-qr";
          return { domain: base, ok, detail: ok ? "OK" : `HTTP ${res.status}` };
        } catch {
          return { domain: base, ok: false, detail: "unreachable" };
        }
      }),
    );
  });
