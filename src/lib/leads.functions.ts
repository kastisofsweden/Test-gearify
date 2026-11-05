import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { clientFingerprint } from "@/lib/clientFingerprint";

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

const leadSchema = z.object({
  name: z.string().max(200),
  email: z.string().max(254),
  phone: z.string().max(60).optional(),
  company: z.string().max(200).optional(),
  message: z.string().max(5000).optional(),
  rental_start: dateField,
  rental_end: dateField,
  source: z.string().max(80).optional(),
  /** Honeypot: real visitors never see or fill this field. */
  website: z.string().max(500).optional(),
  /** Epoch ms when the form was first shown. */
  form_started_at: z.number().int().nonnegative(),
});

export type LeadPayload = z.infer<typeof leadSchema>;

const PUBLIC_ERRORS = [
  "too_fast",
  "rate_limited",
  "invalid_email",
  "invalid_name",
  "too_long",
  "invalid_dates",
];

/**
 * Quote/contact request. Runs on the server so a salted IP hash can be passed to
 * submit_lead (service role only) for the per-visitor rate limit.
 */
export const submitLead = createServerFn({ method: "POST" })
  .inputValidator((input: LeadPayload) => leadSchema.parse(input))
  .handler(async ({ data }) => {
    const fingerprint = await clientFingerprint("lead");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const args: Record<string, string | number> = {
      _name: data.name,
      _email: data.email,
      _source: data.source ?? "website",
      _form_started_at: data.form_started_at,
      _client_fingerprint: fingerprint,
    };
    const optional = {
      _phone: data.phone,
      _company: data.company,
      _message: data.message,
      _rental_start: data.rental_start,
      _rental_end: data.rental_end,
      _honeypot: data.website,
    };
    for (const [key, value] of Object.entries(optional)) if (value) args[key] = value;
    const { error } = await supabaseAdmin.rpc("submit_lead", args as never);
    if (error) {
      const known = PUBLIC_ERRORS.find((code) => error.message.includes(code));
      if (!known) console.error("submit_lead failed", error.message);
      throw new Error(known ?? "lead_failed");
    }
    return { ok: true };
  });
