import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  buildReportEmail,
  forwardDecision,
  resolveExternalReportTarget,
} from "@/lib/unitReportEmail";
import { resolveQrBaseUrl } from "@/lib/unitUrls";

/**
 * Called by the public unit page right after `submit_unit_report` succeeded. Forwards the newest
 * not-yet-forwarded report of that unit (max 5 minutes old) to the product's external address, at
 * most once per report (claimed with external_notified_at), max 5 per unit per hour, identical
 * messages within an hour skipped. Never throws to the visitor: the report is already saved.
 */
export const forwardUnitReport = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) =>
    z.object({ token: z.string().min(16).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: unit } = await supabaseAdmin
        .from("stock_items")
        .select(
          "id, serial_code, equipment:equipment_id(name, external_report_email, forward_reports_to_external)",
        )
        .eq("qr_token", data.token.trim())
        .maybeSingle();
      const item = unit?.equipment as
        | {
            name: string;
            external_report_email: string | null;
            forward_reports_to_external: boolean;
          }
        | null
        | undefined;
      const to = item ? resolveExternalReportTarget(item) : null;
      if (!unit || !item || !to) return { forwarded: false };

      const since = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data: pending } = await supabaseAdmin
        .from("unit_reports")
        .select(
          "id, report_type, message, reporter_name, reporter_phone, reporter_email, created_at",
        )
        .eq("stock_item_id", unit.id)
        .is("external_notified_at", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pending) return { forwarded: false };

      const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
      const { data: recent } = await supabaseAdmin
        .from("unit_reports")
        .select("message, external_notified_at")
        .eq("stock_item_id", unit.id)
        .eq("external_notify_status", "sent")
        .gte("external_notified_at", hourAgo);
      const decision = forwardDecision(
        pending,
        (recent ?? []).filter((r): r is { message: string; external_notified_at: string } =>
          Boolean(r.external_notified_at),
        ),
      );

      // Claim the report so concurrent calls can't send it twice.
      const { data: claimed } = await supabaseAdmin
        .from("unit_reports")
        .update({
          external_notified_at: new Date().toISOString(),
          external_notify_status: "sending",
        })
        .eq("id", pending.id)
        .is("external_notified_at", null)
        .select("id");
      if (!claimed?.length) return { forwarded: false };

      let status: string = decision;
      if (decision === "send") {
        const { data: settings } = await supabaseAdmin
          .from("app_settings")
          .select("qr_base_url")
          .maybeSingle();
        const host = getRequestHeader("host");
        const base = resolveQrBaseUrl(
          settings,
          process.env["VITE_PUBLIC_SITE_URL"],
          host ? `https://${host}` : null,
        );
        const mail = buildReportEmail({
          unitName: item.name,
          serialCode: unit.serial_code,
          reportType: pending.report_type,
          message: pending.message,
          reporterName: pending.reporter_name,
          reporterPhone: pending.reporter_phone,
          reporterEmail: pending.reporter_email,
          createdAt: pending.created_at,
          adminUrl: `${base}/admin?tab=reports`,
        });
        const { sendExternalReportEmail } = await import("@/lib/reportEmail.server");
        try {
          const out = await sendExternalReportEmail({
            to,
            ...mail,
            idempotencyKey: `unit-report-${pending.id}`,
          });
          status = out.sent ? "sent" : `skipped:${out.reason}`;
        } catch (e) {
          console.error("unit report e-mail failed", e instanceof Error ? e.message : e);
          status = "failed";
        }
      }
      await supabaseAdmin
        .from("unit_reports")
        .update({ external_notify_status: status })
        .eq("id", pending.id);
      return { forwarded: status === "sent" };
    } catch (e) {
      console.error("forwardUnitReport failed", e instanceof Error ? e.message : e);
      return { forwarded: false };
    }
  });
