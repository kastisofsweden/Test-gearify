import { useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { forwardUnitReport } from "@/lib/unitReports.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const UNIT_CONTACT_EMAIL = "contact@dreamgroupsweden.se";
const MIN_FILL_MS = 2000;

type Field = "type" | "role" | "message" | "name" | "phone" | "email";
type FieldErrors = Partial<Record<Field, string>>;

const FIELD_ERROR: Record<string, [Field, string]> = {
  invalid_type: ["type", "Choose a note or a fault report."],
  invalid_role: ["role", "Choose whether you are a renting customer or on-site staff."],
  invalid_message: ["message", "Write a message of 3–2000 characters."],
  invalid_name: ["name", "Name can be at most 120 characters."],
  invalid_phone: ["phone", "Phone can be at most 40 characters."],
  invalid_email: ["email", "Enter a valid email address (max 200 characters)."],
};

export function UnitReportForm({
  token,
  unitNumber,
  onRetired,
}: {
  token: string;
  unitNumber: string;
  onRetired: () => void;
}) {
  const loadedAt = useRef<number>(Date.now());
  const [type, setType] = useState<"note" | "fault">("note");
  const [role, setRole] = useState<"" | "customer" | "staff">("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadedAt.current = Date.now();
  }, []);

  const reset = () => {
    setType("note");
    setRole("");
    setMessage("");
    setErrors({});
    setFormError(null);
    setSent(false);
    loadedAt.current = Date.now();
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    const trimmed = message.trim();
    if (!role) next.role = "Choose whether you are a renting customer or on-site staff.";
    if (trimmed.length < 3 || trimmed.length > 2000)
      next.message = "Write a message of 3–2000 characters.";
    if (name.trim().length > 120) next.name = "Name can be at most 120 characters.";
    if (phone.trim().length > 40) next.phone = "Phone can be at most 40 characters.";
    const mail = email.trim();
    if (mail && (mail.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))) {
      next.email = "Enter a valid email address (max 200 characters).";
    }
    return next;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    // Simple bot timer: too-fast submissions get a silent fake success.
    if (Date.now() - loadedAt.current < MIN_FILL_MS) {
      setSent(true);
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.rpc("submit_unit_report", {
        _token: token,
        _type: type,
        _role: role,
        _message: message.trim(),
        _honeypot: website,
        ...(name.trim() ? { _name: name.trim() } : {}),
        ...(phone.trim() ? { _phone: phone.trim() } : {}),
        ...(email.trim() ? { _email: email.trim() } : {}),
      });
      if (error) {
        const code = error.message ?? "";
        const field = Object.keys(FIELD_ERROR).find((k) => code.includes(k));
        if (code.includes("rate_limited")) {
          setFormError(
            `Too many reports right now. Try again shortly or email ${UNIT_CONTACT_EMAIL}`,
          );
        } else if (code.includes("unit_retired")) {
          onRetired();
        } else if (code.includes("invalid_token")) {
          setFormError("The code could not be verified. Reload the page or email us.");
        } else if (field) {
          const [key, text] = FIELD_ERROR[field]!;
          setErrors({ [key]: text });
        } else {
          setFormError(`Something went wrong. Try again or email ${UNIT_CONTACT_EMAIL}.`);
        }
        return;
      }
      setSent(true);
      // Best effort: forwarding to an external e-mail never affects the visitor.
      void forwardUnitReport({ data: { token } }).catch(() => undefined);
    } catch {
      setFormError(`Something went wrong. Try again or email ${UNIT_CONTACT_EMAIL}.`);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="rounded-2xl border border-primary/40 bg-primary/10 p-5">
        <p className="text-base font-semibold">
          Thanks! Your report has been sent to Dream Group Sweden.
        </p>
        <Button variant="outline" className="mt-4" onClick={reset}>
          Send another
        </Button>
      </div>
    );
  }

  const choice = (active: boolean) =>
    `flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
      active
        ? "border-primary bg-primary/15 text-primary"
        : "border-border text-foreground hover:border-primary/60"
    }`;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">What do you want to send?</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Report type">
          <button
            type="button"
            role="radio"
            aria-checked={type === "note"}
            className={choice(type === "note")}
            onClick={() => setType("note")}
          >
            Note
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={type === "fault"}
            className={choice(type === "fault")}
            onClick={() => setType("fault")}
          >
            Fault report
          </button>
        </div>
        {errors.type && <p className="text-sm text-destructive">{errors.type}</p>}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">
          I am <span className="text-destructive">*</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["customer", "Renting customer"],
              ["staff", "On-site staff"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`${choice(role === value)} flex cursor-pointer items-center gap-3`}
            >
              <input
                type="radio"
                name="role"
                value={value}
                checked={role === value}
                onChange={() => setRole(value)}
                className="size-4 accent-[var(--primary)]"
                required
              />
              {label}
            </label>
          ))}
        </div>
        {errors.role && <p className="text-sm text-destructive">{errors.role}</p>}
      </fieldset>

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="report-message" className="text-foreground">
            {type === "fault" ? "Describe the fault" : "Message"}{" "}
            <span className="text-destructive">*</span>
          </Label>
          <span
            className={`text-xs ${message.length > 2000 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {message.length}/2000
          </span>
        </div>
        <Textarea
          id="report-message"
          rows={5}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={Boolean(errors.message) || undefined}
          className="text-foreground"
          placeholder={
            type === "fault"
              ? "E.g. the screen won't start, the cable is broken…"
              : "E.g. found by the stage in hall B…"
          }
        />
        {errors.message && <p className="text-sm text-destructive">{errors.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="report-name" className="text-foreground">
            Name (optional)
          </Label>
          <Input
            id="report-name"
            autoComplete="name"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-foreground"
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="report-phone" className="text-foreground">
            Phone (optional)
          </Label>
          <Input
            id="report-phone"
            type="tel"
            autoComplete="tel"
            maxLength={40}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="text-foreground"
          />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="report-email" className="text-foreground">
            Email (optional)
          </Label>
          <Input
            id="report-email"
            type="email"
            autoComplete="email"
            maxLength={200}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="text-foreground"
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
        </div>
      </div>

      {/* Honeypot: invisible to people, tempting to bots. */}
      <div
        aria-hidden="true"
        className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
      >
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {formError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" disabled={sending} className="w-full sm:w-auto">
        {sending ? "Sending…" : type === "fault" ? "Send fault report" : "Send note"}
      </Button>

      <p className="text-sm text-muted-foreground">
        Want to send a photo? Email it to{" "}
        <a
          className="text-primary underline-offset-4 hover:underline"
          href={`mailto:${UNIT_CONTACT_EMAIL}?subject=${encodeURIComponent(`Item ${unitNumber}`)}`}
        >
          {UNIT_CONTACT_EMAIL}
        </a>{" "}
        and include item number <span className="font-mono text-foreground">{unitNumber}</span>.
      </p>
    </form>
  );
}
