// Sends the external unit-report notification through Lovable's built-in app e-mails.
// Sending needs a verified sender domain (More → Emails). Until that exists, and the app-email
// templates are scaffolded, this soft-skips: the report itself is always saved first.

export type ReportEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};
export type SendOutcome = { sent: true } | { sent: false; reason: string };

export async function sendExternalReportEmail(email: ReportEmail): Promise<SendOutcome> {
  if (!process.env["LOVABLE_API_KEY"]) return { sent: false, reason: "email_not_configured" };
  // No sender domain is verified for this project yet, so there is no send helper to call.
  // Once More → Emails shows a verified domain, the app-email scaffold adds
  // src/lib/email-templates/send-email.ts; wire `sendTemplateEmail("unit-report-forward", …)` here.
  void email;
  return { sent: false, reason: "email_not_configured" };
}
