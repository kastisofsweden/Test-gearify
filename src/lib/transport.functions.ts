import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { clientFingerprint } from "@/lib/clientFingerprint";
import { pendingTransport, type TransportQuote } from "@/lib/transportPricing";

const quoteSchema = z.object({
  address: z.string().max(300),
  equipment_ids: z.array(z.string().max(64)).max(50),
});

const RATE_LIMIT_PER_HOUR = 30;

/**
 * Storefront transport estimate. Public, so it is rate limited per salted IP hash and
 * always resolves (pending fallback) instead of throwing.
 */
export const quoteTransport = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof quoteSchema>) => quoteSchema.parse(input))
  .handler(async ({ data }): Promise<TransportQuote> => {
    try {
      const fingerprint = await clientFingerprint("transport");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { count } = await supabaseAdmin
        .from("transport_quote_log")
        .select("id", { count: "exact", head: true })
        .eq("client_fingerprint", fingerprint)
        .gt("created_at", new Date(Date.now() - 3600_000).toISOString());
      if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) return pendingTransport("rate_limited");
      await supabaseAdmin.from("transport_quote_log").insert({ client_fingerprint: fingerprint });
      const { computeTransport } = await import("@/lib/transport.server");
      return computeTransport({ address: data.address, equipmentIds: data.equipment_ids });
    } catch (error) {
      console.error("quoteTransport failed", error instanceof Error ? error.message : error);
      return pendingTransport("error");
    }
  });

const staffQuoteSchema = quoteSchema.extend({ staff_id: z.string().uuid() });

/**
 * Back-office estimate priced with a chosen responsible staff member's rate. The rate is
 * read through the caller's own RLS, so partners can only price with their company's staff.
 */
export const quoteTransportForStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof staffQuoteSchema>) => staffQuoteSchema.parse(input))
  .handler(async ({ data, context }): Promise<TransportQuote> => {
    const { data: staff, error } = await context.supabase
      .from("staff")
      .select("hourly_rate_sek")
      .eq("id", data.staff_id)
      .maybeSingle();
    if (error || !staff) return pendingTransport("forbidden");
    const { computeTransport } = await import("@/lib/transport.server");
    return computeTransport({
      address: data.address,
      equipmentIds: data.equipment_ids,
      hourlyRateSek: Number(staff.hourly_rate_sek),
    });
  });
