import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useCart } from "@/components/site/CartButton";
import { SiteLink } from "@/components/site/SiteLink";
import { SiteShell } from "@/components/site/SiteShell";
import { Honeypot } from "@/components/site/Honeypot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bookingErrorMessage, money, quoteShipping } from "@/lib/booking";
import { createBooking } from "@/lib/booking.functions";
import { quoteTransport } from "@/lib/transport.functions";
import type { TransportQuote } from "@/lib/transportPricing";
import { quotedTotals, useCartQuote } from "@/lib/pricing";
import { clearCart, rentalDays } from "@/lib/cart";
import { bookingPaths, pageOf, t, type Lang } from "@/lib/site";

export function CheckoutView({ lang }: { lang: Lang }) {
  const cart = useCart();
  const navigate = useNavigate();
  const days = rentalDays(cart.startsOn, cart.endsOn);
  const [method, setMethod] = useState<"pickup" | "delivery">("pickup");
  const [postal, setPostal] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [transport, setTransport] = useState<TransportQuote | null>(null);
  const [transportLoading, setTransportLoading] = useState(false);
  const [shipping, setShipping] = useState(0);
  const [zoneName, setZoneName] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const catalog = pageOf("catalog");
  const formStartedAt = useRef<number>(0);

  useEffect(() => {
    formStartedAt.current = Date.now();
  }, []);

  useEffect(() => {
    let active = true;
    if (method === "pickup") {
      setShipping(0);
      setZoneName(null);
      return () => {
        active = false;
      };
    }
    quoteShipping("delivery", { postal, city })
      .then((result) => {
        if (!active) return;
        setShipping(Number(result.cost));
        setZoneName(result.zone_name);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [method, postal, city]);

  const equipmentKey = cart.items.map((i) => i.equipmentId).join(",");
  useEffect(() => {
    if (method !== "delivery") {
      setTransport(null);
      return;
    }
    const full = [address.trim(), [postal.trim(), city.trim()].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
    if (address.trim().length < 3 || city.trim().length < 2) {
      setTransport(null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setTransportLoading(true);
      quoteTransport({ data: { address: full, equipment_ids: equipmentKey.split(",") } })
        .then((result) => {
          if (active) setTransport(result);
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setTransportLoading(false);
        });
    }, 700);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [method, address, postal, city, equipmentKey]);

  const transportAmount = transport?.status === "quoted" ? transport.amount : 0;
  const { data: quote } = useCartQuote(cart);
  const totals = quotedTotals(quote, shipping + transportAmount);
  const shippingOnly = totals.shipping - transportAmount;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart.items.length) return;
    const form = new FormData(event.currentTarget);
    setSending(true);
    try {
      const result = await createBooking({
        data: {
          starts_on: cart.startsOn,
          ends_on: cart.endsOn,
          customer_name: String(form.get("name") ?? ""),
          customer_email: String(form.get("email") ?? ""),
          customer_phone: String(form.get("phone") ?? ""),
          customer_company: String(form.get("company") ?? ""),
          shipping_method: method,
          delivery_address: method === "delivery" ? String(form.get("address") ?? "") : "",
          delivery_postal_code: method === "delivery" ? postal : "",
          delivery_city: method === "delivery" ? city : "",
          customer_note: String(form.get("note") ?? ""),
          items: cart.items.map((i) => ({ equipment_id: i.equipmentId, quantity: i.quantity })),
          website: String(form.get("website") ?? ""),
          form_started_at: formStartedAt.current,
        },
      });
      clearCart();
      toast.success(t("booking_done", lang));
      navigate({
        to: `${bookingPaths(lang).order}/$token`,
        params: { token: result.share_token },
      });
    } catch (error) {
      toast.error(bookingErrorMessage(error instanceof Error ? error.message : "", lang));
    } finally {
      setSending(false);
    }
  }

  if (!cart.items.length) {
    return (
      <SiteShell lang={lang}>
        <section className="py-20">
          <div className="container-page rounded-lg border border-border bg-card p-10 text-center">
            <p className="text-muted-foreground">{t("empty_cart", lang)}</p>
            <Button asChild className="mt-4">
              <SiteLink to={catalog.path[lang]}>{t("continue_shopping", lang)}</SiteLink>
            </Button>
          </div>
        </section>
      </SiteShell>
    );
  }

  return (
    <SiteShell lang={lang}>
      <section className="border-b border-border bg-secondary/60">
        <div className="container-page py-12">
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">{t("checkout", lang)}</h1>
          <p className="mt-3 text-muted-foreground">{t("we_confirm", lang)}</p>
        </div>
      </section>

      <form onSubmit={onSubmit} className="py-12">
        <div className="container-page grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-6">
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-bold text-foreground">{t("delivery_method", lang)}</h2>
              <div className="mt-4 grid gap-3">
                {(["pickup", "delivery"] as const).map((option) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${
                      method === option ? "border-primary bg-secondary/60" : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="method"
                      className="mt-1"
                      checked={method === option}
                      onChange={() => setMethod(option)}
                    />
                    <span>
                      <span className="block font-medium text-foreground">{t(option, lang)}</span>
                      <span className="block text-sm text-muted-foreground">
                        {t(`${option}_note`, lang)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {method === "delivery" ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="co-address">{t("address", lang)}</Label>
                    <Input
                      id="co-address"
                      name="address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="co-postal">{t("postal_code", lang)}</Label>
                    <Input
                      id="co-postal"
                      value={postal}
                      onChange={(e) => setPostal(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="co-city">{t("city", lang)}</Label>
                    <Input
                      id="co-city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      required
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-bold text-foreground">{t("customer_details", lang)}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="co-name">{t("form_name", lang)}</Label>
                  <Input id="co-name" name="name" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="co-company">{t("form_company", lang)}</Label>
                  <Input id="co-company" name="company" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="co-email">{t("form_email", lang)}</Label>
                  <Input id="co-email" name="email" type="email" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="co-phone">{t("form_phone", lang)}</Label>
                  <Input id="co-phone" name="phone" />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="co-note">{t("note", lang)}</Label>
                  <Textarea id="co-note" name="note" rows={3} />
                </div>
                <Honeypot />
              </div>
            </div>
          </div>

          <aside className="h-fit rounded-lg border border-border bg-card p-6 shadow-card">
            <h2 className="text-lg font-bold text-foreground">{t("cart", lang)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {cart.startsOn} → {cart.endsOn} · {days} {t("days_label", lang)}
            </p>
            <ul className="mt-4 grid gap-2 text-sm">
              {cart.items.map((item) => (
                <li key={item.equipmentId} className="flex justify-between gap-3">
                  <span>
                    {item.quantity} × {item.name}
                  </span>
                  <span>
                    {money(
                      quote?.lines[item.equipmentId]?.subtotal ??
                        item.dailyPrice * item.quantity * days,
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid gap-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("subtotal", lang)}</dt>
                <dd>{money(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {t("shipping", lang)}
                  {zoneName ? ` · ${zoneName}` : ""}
                </dt>
                <dd>{money(shippingOnly)}</dd>
              </div>
              {method === "delivery" ? (
                <div className="grid gap-1">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Transport</dt>
                    <dd>
                      {transportLoading
                        ? lang === "sv"
                          ? "Beräknar…"
                          : "Calculating…"
                        : transport?.status === "quoted"
                          ? money(transport.amount)
                          : "—"}
                    </dd>
                  </div>
                  {transport?.status === "quoted" ? (
                    <ul className="grid gap-0.5 text-xs text-muted-foreground">
                      {transport.breakdown.warehouses.map((w) => (
                        <li key={w.warehouse_id}>
                          {lang === "sv" ? "Från" : "From"} {w.warehouse_name}:{" "}
                          {Math.round(w.distance_m / 100) / 10} km ·{" "}
                          {w.staff_hours.toLocaleString(lang === "sv" ? "sv-SE" : "en-GB")}{" "}
                          {lang === "sv" ? "arbetstimmar" : "staff hours"} ·{" "}
                          {lang === "sv" ? "lastbil" : "truck"} {money(w.truck_cost)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {lang === "sv"
                        ? "Transport beräknas och bekräftas i offerten"
                        : "Transport is calculated and confirmed in the quote"}
                    </p>
                  )}
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("vat", lang)}</dt>
                <dd>{money(totals.vat)}</dd>
              </div>
              {totals.deposit > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {lang === "sv" ? "Deposition" : "Deposit"}
                  </dt>
                  <dd>{money(totals.deposit)}</dd>
                </div>
              ) : null}

              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <dt>{t("total", lang)}</dt>
                <dd>{money(totals.total)}</dd>
              </div>
            </dl>
            <Button
              type="submit"
              size="lg"
              className="mt-6 w-full shadow-button"
              disabled={sending}
            >
              {sending ? t("booking_sending", lang) : t("place_booking", lang)}
            </Button>
          </aside>
        </div>
      </form>
    </SiteShell>
  );
}
