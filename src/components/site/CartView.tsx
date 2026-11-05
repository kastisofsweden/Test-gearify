import { Trash2 } from "lucide-react";

import { useCart } from "@/components/site/CartButton";
import { SiteLink } from "@/components/site/SiteLink";
import { SiteShell } from "@/components/site/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/booking";
import { quotedTotals, useCartQuote } from "@/lib/pricing";
import { rentalDays, removeFromCart, setCartDates, setQuantity } from "@/lib/cart";
import { bookingPaths, pageOf, t, type Lang } from "@/lib/site";

export function CartView({ lang }: { lang: Lang }) {
  const cart = useCart();
  const days = rentalDays(cart.startsOn, cart.endsOn);
  const { data: quote } = useCartQuote(cart);
  const totals = quotedTotals(quote);
  const catalog = pageOf("catalog");

  return (
    <SiteShell lang={lang}>
      <section className="border-b border-border bg-secondary/60">
        <div className="container-page py-12">
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">{t("cart", lang)}</h1>
        </div>
      </section>

      <section className="py-12">
        <div className="container-page grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-4">
            <div className="grid gap-4 rounded-lg border border-border bg-card p-6 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="cart-start">{t("form_start", lang)}</Label>
                <Input
                  id="cart-start"
                  type="date"
                  value={cart.startsOn}
                  onChange={(e) => setCartDates(e.target.value, cart.endsOn || e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cart-end">{t("form_end", lang)}</Label>
                <Input
                  id="cart-end"
                  type="date"
                  value={cart.endsOn}
                  min={cart.startsOn}
                  onChange={(e) => setCartDates(cart.startsOn, e.target.value)}
                />
              </div>
            </div>

            {cart.items.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-8 text-center">
                <p className="text-muted-foreground">{t("empty_cart", lang)}</p>
                <Button asChild className="mt-4">
                  <SiteLink to={catalog.path[lang]}>{t("continue_shopping", lang)}</SiteLink>
                </Button>
              </div>
            ) : (
              cart.items.map((item) => (
                <div
                  key={item.equipmentId}
                  className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4"
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-20 w-24 rounded object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <div className="min-w-40 flex-1">
                    <p className="font-semibold text-foreground">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {money(quote?.lines[item.equipmentId]?.unit_price ?? item.dailyPrice)}{" "}
                      {t("per_day", lang)} · {days} {t("days_label", lang)}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => setQuantity(item.equipmentId, Number(e.target.value) || 1)}
                    className="w-20"
                    aria-label={t("quantity", lang)}
                  />
                  <p className="w-28 text-right font-semibold text-foreground">
                    {money(
                      quote?.lines[item.equipmentId]?.subtotal ??
                        item.dailyPrice * item.quantity * days,
                    )}
                  </p>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFromCart(item.equipmentId)}
                    aria-label={t("remove", lang)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <aside className="h-fit rounded-lg border border-border bg-card p-6 shadow-card">
            <h2 className="text-lg font-bold text-foreground">{t("total", lang)}</h2>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("subtotal", lang)}</dt>
                <dd>{money(totals.subtotal)}</dd>
              </div>
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
              asChild
              size="lg"
              className="mt-6 w-full shadow-button"
              disabled={!cart.items.length}
            >
              <SiteLink to={bookingPaths(lang).checkout}>{t("to_checkout", lang)}</SiteLink>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">{t("price_excl_vat", lang)}</p>
          </aside>
        </div>
      </section>
    </SiteShell>
  );
}
