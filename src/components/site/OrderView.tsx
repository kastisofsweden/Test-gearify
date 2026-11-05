import { SiteShell } from "@/components/site/SiteShell";
import { lineTotals, money, STATUS_LABEL, type OrderStatus } from "@/lib/booking";
import type { PublicOrder } from "@/lib/orders.functions";
import { t, type Lang } from "@/lib/site";

export function OrderView({ order, lang }: { order: PublicOrder | null; lang: Lang }) {
  if (!order) {
    return (
      <SiteShell lang={lang}>
        <section className="py-20">
          <div className="container-page rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
            {t("order_not_found", lang)}
          </div>
        </section>
      </SiteShell>
    );
  }

  const subtotal = order.lines.reduce((sum, l) => sum + l.quantity * l.days * l.unit_price, 0);
  const totals = lineTotals(subtotal, {
    shipping: order.shipping_cost + (order.transport_amount ?? 0),
    discountPercent: order.discount_percent,
    vatPercent: order.vat_percent,
  });
  const statusLabel = STATUS_LABEL[order.status as OrderStatus]?.[lang] ?? order.status;

  return (
    <SiteShell lang={lang}>
      <section className="border-b border-border bg-secondary/60">
        <div className="container-page py-12">
          <p className="eyebrow-label">{t("track_order", lang)}</p>
          <h1 className="mt-3 text-3xl font-bold text-foreground md:text-4xl">
            {order.order_number}
          </h1>
          {order.status === "pending" ? (
            <div
              role="status"
              className="mt-5 max-w-2xl rounded-lg border border-primary/40 bg-card p-4"
            >
              <p className="font-semibold text-foreground">{t("booking_pending_title", lang)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("booking_pending_body", lang)}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-muted-foreground">{t("we_confirm", lang)}</p>
          )}
        </div>
      </section>

      <section className="py-12">
        <div className="container-page grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-bold text-foreground">{t("cart", lang)}</h2>
            <ul className="mt-4 grid gap-3 text-sm">
              {order.lines.map((line, index) => (
                <li
                  key={`${line.description}-${index}`}
                  className="flex justify-between gap-3 border-b border-border/60 pb-2"
                >
                  <span>
                    {line.quantity} × {line.description}
                    <span className="block text-muted-foreground">
                      {line.days} {t("days_label", lang)} · {money(line.unit_price)}{" "}
                      {t("per_day", lang)}
                    </span>
                  </span>
                  <span className="font-medium">
                    {money(line.quantity * line.days * line.unit_price)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("subtotal", lang)}</dt>
                <dd>{money(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("shipping", lang)}</dt>
                <dd>{money(order.shipping_cost)}</dd>
              </div>
              {order.shipping_method === "delivery" ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Transport</dt>
                  <dd className="text-right">
                    {order.transport_amount != null
                      ? money(order.transport_amount)
                      : lang === "sv"
                        ? "Transport beräknas och bekräftas i offerten"
                        : "Transport is calculated and confirmed in the quote"}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("vat", lang)}</dt>
                <dd>{money(totals.vat)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <dt>{t("total", lang)}</dt>
                <dd>{money(totals.total)}</dd>
              </div>
            </dl>
          </div>

          <aside className="h-fit rounded-lg border border-border bg-card p-6">
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">{t("status", lang)}</dt>
                <dd className="font-semibold text-primary">{statusLabel}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("rental_period", lang)}</dt>
                <dd className="font-medium">
                  {order.starts_on} → {order.ends_on}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("delivery_method", lang)}</dt>
                <dd className="font-medium">
                  {order.shipping_method === "delivery" ? t("delivery", lang) : t("pickup", lang)}
                </dd>
              </div>
              {order.delivery_address ? (
                <div>
                  <dt className="text-muted-foreground">{t("address", lang)}</dt>
                  <dd className="font-medium">
                    {order.delivery_address}, {order.delivery_postal_code} {order.delivery_city}
                  </dd>
                </div>
              ) : null}
              {order.customer_note ? (
                <div>
                  <dt className="text-muted-foreground">{t("note", lang)}</dt>
                  <dd>{order.customer_note}</dd>
                </div>
              ) : null}
            </dl>
          </aside>
        </div>
      </section>
    </SiteShell>
  );
}
