import { escapeHtml } from "@/lib/escapeHtml";

/** Max forwarded e-mails per unit per hour. */
export const MAX_FORWARDS_PER_UNIT_PER_HOUR = 5;
/** An identical message to the same unit within this window is not forwarded again. */
export const DUPLICATE_WINDOW_MS = 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where a unit's reports go, or null when forwarding is off or the address is invalid. */
export function resolveExternalReportTarget(item: {
  forward_reports_to_external: boolean | null | undefined;
  external_report_email: string | null | undefined;
}): string | null {
  if (!item.forward_reports_to_external) return null;
  const email = item.external_report_email?.trim() ?? "";
  return email.length <= 200 && EMAIL_RE.test(email) ? email.toLowerCase() : null;
}

const normalizeMessage = (m: string) => m.trim().replace(/\s+/g, " ").toLowerCase();

/** Rate limit + dedupe decision for one new report, given the unit's recently forwarded reports. */
export function forwardDecision(
  report: { message: string; created_at: string },
  recentForwarded: { message: string; external_notified_at: string }[],
): "send" | "rate_limited" | "duplicate" {
  const now = new Date(report.created_at).getTime();
  const lastHour = recentForwarded.filter(
    (r) => now - new Date(r.external_notified_at).getTime() < 60 * 60 * 1000,
  );
  const msg = normalizeMessage(report.message);
  if (
    recentForwarded.some(
      (r) =>
        normalizeMessage(r.message) === msg &&
        now - new Date(r.external_notified_at).getTime() < DUPLICATE_WINDOW_MS,
    )
  )
    return "duplicate";
  if (lastHour.length >= MAX_FORWARDS_PER_UNIT_PER_HOUR) return "rate_limited";
  return "send";
}

export type ReportEmailInput = {
  unitName: string;
  serialCode: string;
  reportType: string;
  message: string;
  reporterName?: string | null;
  reporterPhone?: string | null;
  reporterEmail?: string | null;
  createdAt: string;
  adminUrl: string;
};

const TYPE_LABEL: Record<string, string> = { fault: "Fault report", note: "Note" };

export const stockholmTime = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));

/** Subject, plain text and escaped HTML for an external report notification (English). */
export function buildReportEmail(r: ReportEmailInput) {
  const type = TYPE_LABEL[r.reportType] ?? r.reportType;
  const when = stockholmTime(r.createdAt);
  const contact = [r.reporterName, r.reporterPhone, r.reporterEmail]
    .map((v) => v?.trim())
    .filter(Boolean) as string[];
  const subject = `${type}: ${r.unitName} (${r.serialCode})`.slice(0, 200);
  const rows: [string, string][] = [
    ["Unit", `${r.unitName} — ${r.serialCode}`],
    ["Type", type],
    ["Time", `${when} (Europe/Stockholm)`],
    ["Contact", contact.join(", ") || "—"],
  ];
  const text = [
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    r.message,
    "",
    `Open in Renthub: ${r.adminUrl}`,
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#111">${rows
    .map(([k, v]) => `<p><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>`)
    .join(
      "",
    )}<p style="white-space:pre-wrap;border-left:3px solid #999;padding-left:8px">${escapeHtml(
    r.message,
  )}</p><p><a href="${escapeHtml(r.adminUrl)}">Open in Renthub</a></p></div>`;
  return { subject, text, html };
}
