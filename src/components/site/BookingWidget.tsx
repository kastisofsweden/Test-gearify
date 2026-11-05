import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CalendarRange, Check, Minus, Plus } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";

import { useCart } from "@/components/site/CartButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addDaysISO,
  fetchAvailability,
  fetchBookable,
  fetchBundleComponents,
  money,
  todayISO,
} from "@/lib/booking";
import { availabilityTone, fetchPrice, TONE_DOT, TONE_TEXT } from "@/lib/pricing";
import { addToCart, rentalDays, setCartDates } from "@/lib/cart";
import { catalogueImage } from "@/lib/catalogue-images";
import { bookingPaths, contentOf, imageOf, t, type Lang, type SitePage } from "@/lib/site";

export function BookingWidget({ page, lang }: { page: SitePage; lang: Lang }) {
  const navigate = useNavigate();
  const type = page.type === "kit" ? "kit" : "product";
  const cart = useCart();
  const startsOn = cart.startsOn || addDaysISO(todayISO(), 2);
  const endsOn = cart.endsOn || addDaysISO(todayISO(), 3);
  const [quantity, setQuantity] = useState(1);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [showSticky, setShowSticky] = useState(false);

  const { data: item, isLoading } = useQuery({
    queryKey: ["bookable", type, page.slug],
    queryFn: () => fetchBookable(type, page.slug),
  });

  const days = rentalDays(startsOn, endsOn);

  const { data: components = [] } = useQuery({
    queryKey: ["bundle-components", item?.id],
    enabled: Boolean(item?.id) && item?.item_kind === "bundle",
    queryFn: () => (item?.id ? fetchBundleComponents(item.id) : Promise.resolve([])),
  });

  const { data: available, isFetching } = useQuery({
    queryKey: ["availability", item?.id, startsOn, endsOn],
    enabled: Boolean(item?.id) && days > 0,
    queryFn: () => (item?.id ? fetchAvailability(item.id, startsOn, endsOn) : Promise.resolve(0)),
  });

  const { data: quote } = useQuery({
    queryKey: ["price", item?.id, startsOn, endsOn, quantity],
    enabled: Boolean(item?.id) && days > 0,
    queryFn: () =>
      item?.id ? fetchPrice(item.id, startsOn, endsOn, quantity) : Promise.resolve(null),
  });

  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShowSticky(!e?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [item?.id]);
  useEffect(() => {
    if (typeof available === "number" && available > 0 && quantity > available) {
      setQuantity(available);
    }
  }, [available, quantity]);

  if (isLoading) {
    return (
      <div
        className="h-64 animate-pulse rounded-lg border border-border bg-card"
        aria-busy="true"
      />
    );
  }
  if (!item) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-card">
        <p className="font-display text-lg font-semibold text-foreground">
          {lang === "sv"
            ? "Onlinebokning är inte tillgänglig för denna produkt"
            : "Online booking isn't available for this item"}
        </p>
        <p className="text-sm text-muted-foreground">
          {lang === "sv"
            ? "Skicka en offertförfrågan så återkommer vi med pris och tillgänglighet för dina datum."
            : "Send a quote request and we'll get back with price and availability for your dates."}
        </p>
        <Button asChild size="lg" className="w-full shadow-button">
          <a
            href={lang === "sv" ? "#offert" : "#quote"}
            onClick={(e) => {
              const el = document.querySelector("form");
              if (el) {
                e.preventDefault();
                el.scrollIntoView({ behavior: "smooth" });
              } else window.location.href = lang === "sv" ? "/kontakt" : "/en/contact";
            }}
          >
            {t("cta_quote", lang)}
          </a>
        </Button>
      </div>
    );
  }

  const isService = quote?.item_kind === "service";
  const lineTotal = quote?.subtotal ?? item.daily_price * quantity * days;
  const unitPrice = quote?.unit_price ?? Number(item.daily_price);
  const tone = isService ? "green" : availabilityTone(available, quantity);
  const soldOut = tone === "red";
  const rateLabel =
    quote?.rate_unit === "fixed" || isService
      ? lang === "sv"
        ? "fast pris"
        : "fixed price"
      : quote?.rate_unit === "hour"
        ? lang === "sv"
          ? "per timme"
          : "per hour"
        : quote?.rate_unit === "week"
          ? lang === "sv"
            ? "per vecka"
            : "per week"
          : quote?.rate_unit === "month"
            ? lang === "sv"
              ? "per månad"
              : "per month"
            : t("per_day", lang);

  const add = () => {
    if (days <= 0) {
      toast.error(t("pick_dates", lang));
      return;
    }
    addToCart(
      {
        equipmentId: item.id,
        name: contentOf(page, lang).h1 || item.name,
        image: catalogueImage(page) || item.image_url || "",
        dailyPrice: Number(item.daily_price),
        quantity,
        pageType: type,
        slug: page.slug,
      },
      { startsOn, endsOn },
    );
    toast.success(t("added_to_cart", lang));
    navigate({ to: bookingPaths(lang).cart });
  };

  const c = contentOf(page, lang);
  const sv = lang === "sv";
  const button = (
    <Button
      size="lg"
      disabled={soldOut}
      onClick={add}
      className="h-12 w-full rounded-none text-sm font-semibold uppercase tracking-wide"
    >
      {sv ? "Lägg i varukorgen" : "Add to cart"}
    </Button>
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-foreground">
        <span className="text-lg font-bold">{money(unitPrice)}</span>{" "}
        <span className="text-muted-foreground">{rateLabel}</span>
      </p>
      <p className="flex items-center gap-2 text-sm">
        <span className={`inline-block size-2.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
        {isFetching ? (
          <span className="text-muted-foreground">{t("checking", lang)}</span>
        ) : isService ? (
          <span className={`font-medium ${TONE_TEXT.green}`}>
            {sv ? "Tjänst – alltid bokningsbar" : "Service – always bookable"}
          </span>
        ) : soldOut ? (
          <span className={`font-medium ${TONE_TEXT.red}`}>{t("none_available", lang)}</span>
        ) : typeof available === "number" ? (
          <span className={`font-medium ${TONE_TEXT[tone]}`}>
            {available} {t("available_now", lang)}
          </span>
        ) : null}
      </p>

      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-foreground">
          <CalendarRange className="h-4 w-4" /> {sv ? "Hyresperiod" : "Hire period"} · {days}{" "}
          {t("days_label", lang)}
        </p>
        <div className="grid grid-cols-2 border border-border">
          <Input
            aria-label={sv ? "Startdatum" : "Start date"}
            type="date"
            min={addDaysISO(todayISO(), 1)}
            value={startsOn}
            onChange={(e) => {
              const n = e.target.value;
              if (n) setCartDates(n, n > endsOn ? n : endsOn);
            }}
            className="h-11 rounded-none border-0 border-r border-border text-sm"
          />
          <Input
            aria-label={sv ? "Slutdatum" : "End date"}
            type="date"
            min={startsOn}
            value={endsOn}
            onChange={(e) => {
              if (e.target.value) setCartDates(startsOn, e.target.value);
            }}
            className="h-11 rounded-none border-0 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase text-foreground">
          {t("quantity", lang)}
        </span>
        <div className="flex items-center border border-border">
          <button
            type="button"
            aria-label="-"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="grid size-10 place-items-center text-foreground hover:bg-secondary"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-sm font-semibold">{quantity}</span>
          <button
            type="button"
            aria-label="+"
            onClick={() =>
              setQuantity(
                isService ? quantity + 1 : Math.min(Math.max(available ?? 1, 1), quantity + 1),
              )
            }
            className="grid size-10 place-items-center text-foreground hover:bg-secondary"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-4 border-t border-border pt-4">
        <span className="text-xs uppercase text-muted-foreground">
          {sv ? "Totalt för perioden" : "Total for period"} · {t("price_excl_vat", lang)}
        </span>
        <span className="shrink-0 whitespace-nowrap text-xl font-bold text-foreground">
          {money(lineTotal)}
        </span>
      </div>
      {quote && quote.deposit > 0 ? (
        <p className="-mt-3 text-xs text-muted-foreground">
          {sv ? "Deposition" : "Deposit"}: {money(quote.deposit)}
        </p>
      ) : null}

      <div ref={buttonRef}>{button}</div>
      <a
        href="#quote"
        className="block text-center text-sm text-foreground underline underline-offset-4 hover:text-primary"
      >
        {sv ? "Begär prisförslag" : "Request a quote"}
      </a>

      <Accordion type="multiple" className="border-t border-border">
        <AccordionItem value="desc">
          <AccordionTrigger className="font-sans text-sm font-semibold uppercase tracking-wide">
            {sv ? "Beskrivning & specifikationer" : "Description & specifications"}
          </AccordionTrigger>
          <AccordionContent>
            {c.intro ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{c.intro}</p>
            ) : null}
            {c.specs.length ? (
              <dl className="mt-3 divide-y divide-border">
                {c.specs.map((s) => (
                  <div key={s.label} className="flex justify-between gap-4 py-2 text-sm">
                    <dt className="text-muted-foreground">{s.label}</dt>
                    <dd className="text-right font-medium text-foreground">{s.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </AccordionContent>
        </AccordionItem>
        {components.length || c.included.length ? (
          <AccordionItem value="inc">
            <AccordionTrigger className="font-sans text-sm font-semibold uppercase tracking-wide">
              {page.type === "kit"
                ? sv
                  ? "Ingår i paketet"
                  : "Included in the kit"
                : sv
                  ? "Tillbehör"
                  : "Accessories"}
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-2">
                {components.map((component) => (
                  <li
                    key={component.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center overflow-hidden bg-studio">
                        {component.image_url ? (
                          <img
                            src={component.image_url}
                            alt=""
                            className="h-full w-full object-contain mix-blend-multiply"
                            loading="lazy"
                          />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </span>
                      <span className="truncate text-foreground">{component.name}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{component.quantity}×</span>
                  </li>
                ))}
                {!components.length &&
                  c.included.map((x) => (
                    <li key={x} className="flex gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {x}
                    </li>
                  ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ) : null}
        <AccordionItem value="terms">
          <AccordionTrigger className="font-sans text-sm font-semibold uppercase tracking-wide">
            {sv ? "Leverans, upphämtning & villkor" : "Delivery, pickup & terms"}
          </AccordionTrigger>
          <AccordionContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              {sv
                ? "Leverans i hela Sverige eller upphämtning hos oss. All utrustning testas före leverans."
                : "Delivery across Sweden or pickup from us. All equipment is tested before dispatch."}
            </p>
            <p>
              {sv
                ? "Hyran räknas per vald period. Priser exkl. moms. Företagsfaktura finns."
                : "Rent is charged for the chosen period. Prices excl. VAT. Business invoicing available."}
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {showSticky ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background p-3 md:hidden">
          {button}
        </div>
      ) : null}
    </div>
  );
}
