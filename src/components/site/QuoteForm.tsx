import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useServerFn } from "@tanstack/react-start";

import { submitLead } from "@/lib/leads.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Honeypot } from "@/components/site/Honeypot";
import { t, type Lang } from "@/lib/site";

function leadErrorMessage(message: string, lang: Lang) {
  const sv = lang === "sv";
  if (message.includes("too_fast"))
    return sv
      ? "Det gick lite för snabbt. Vänta några sekunder och försök igen."
      : "That was a little fast. Wait a few seconds and try again.";
  if (message.includes("rate_limited"))
    return sv
      ? "Vi har redan fått flera förfrågningar från dig. Försök igen om en stund."
      : "We already have several requests from you. Please try again later.";
  if (message.includes("invalid_email"))
    return sv ? "Ange en giltig e-postadress." : "Enter a valid email.";
  if (message.includes("invalid_name")) return sv ? "Ange ditt namn." : "Enter your name.";
  if (message.includes("too_long")) return sv ? "Texten är för lång." : "The text is too long.";
  if (message.includes("invalid_dates"))
    return sv ? "Kontrollera datumen." : "Please check the dates.";
  return t("form_error", lang);
}

export function QuoteForm({ lang, source = "website" }: { lang: Lang; source?: string }) {
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const formStartedAt = useRef<number>(0);
  const sendLead = useServerFn(submitLead);

  useEffect(() => {
    formStartedAt.current = Date.now();
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const opt = (key: string) => text(key) || undefined;
    try {
      await sendLead({
        data: {
          name: text("name"),
          email: text("email"),
          source,
          form_started_at: formStartedAt.current,
          phone: opt("phone"),
          company: opt("company"),
          message: opt("message"),
          rental_start: opt("rental_start"),
          rental_end: opt("rental_end"),
          website: opt("website"),
        },
      });
    } catch (error) {
      setSending(false);
      toast.error(leadErrorMessage(error instanceof Error ? error.message : "", lang));
      return;
    }
    setSending(false);
    setDone(true);
    toast.success(t("form_ok", lang));
  }

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-secondary p-8 text-center">
        <p className="text-lg font-medium text-secondary-foreground">{t("form_ok", lang)}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="qf-name" className="text-foreground">
          {t("form_name", lang)}
        </Label>
        <Input id="qf-name" name="name" required className="text-foreground" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="qf-company" className="text-foreground">
          {t("form_company", lang)}
        </Label>
        <Input id="qf-company" name="company" className="text-foreground" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="qf-email" className="text-foreground">
          {t("form_email", lang)}
        </Label>
        <Input id="qf-email" name="email" type="email" required className="text-foreground" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="qf-phone" className="text-foreground">
          {t("form_phone", lang)}
        </Label>
        <Input id="qf-phone" name="phone" className="text-foreground" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="qf-start" className="text-foreground">
          {t("form_start", lang)}
        </Label>
        <Input id="qf-start" name="rental_start" type="date" className="text-foreground" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="qf-end" className="text-foreground">
          {t("form_end", lang)}
        </Label>
        <Input id="qf-end" name="rental_end" type="date" className="text-foreground" />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="qf-message" className="text-foreground">
          {t("form_message", lang)}
        </Label>
        <Textarea id="qf-message" name="message" rows={4} className="text-foreground" />
      </div>
      <Honeypot />
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" disabled={sending} className="w-full sm:w-auto">
          {sending ? t("form_sending", lang) : t("form_submit", lang)}
        </Button>
      </div>
    </form>
  );
}
