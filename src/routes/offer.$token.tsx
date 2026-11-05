import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatSek, offerTotals, type Offer, type OfferItem } from "@/lib/rental";

type PublicOffer = Pick<
  Offer,
  | "offer_number"
  | "title"
  | "customer_name"
  | "rental_start"
  | "rental_end"
  | "valid_until"
  | "discount_percent"
  | "vat_percent"
  | "intro"
  | "terms"
  | "status"
  | "sent_at"
> & {
  items: Pick<
    OfferItem,
    "id" | "description" | "quantity" | "days" | "unit_price" | "sort_order"
  >[];
};
import { BrandLogo } from "@/components/BrandLogo";

export const Route = createFileRoute("/offer/$token")({
  head: () => ({
    meta: [
      { title: "Your rental offer | Renthub" },
      {
        name: "description",
        content: "View your personal AV equipment rental offer from Renthub.",
      },
      { property: "og:title", content: "Your rental offer | Renthub" },
      {
        property: "og:description",
        content: "Line items, rental period and pricing for your AV rental.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OfferPage,
});

function OfferPage() {
  const { token } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-offer", token],
    queryFn: async () => {
      // Public view: only the safe projection returned by get_public_offer (no internal notes, lead or owner).
      const { data: offer, error: offerError } = await supabase.rpc("get_public_offer", {
        _token: token,
      });
      if (offerError) throw offerError;
      return (offer as unknown as PublicOffer | null) ?? null;
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading offer…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="font-display text-3xl tracking-wide">Offer not available</h1>
        <p className="text-sm text-muted-foreground">
          This link is invalid or the offer has not been shared yet.
        </p>
      </div>
    );
  }

  const offer = data;
  const items = data.items;
  const totals = offerTotals(items, Number(offer.discount_percent), Number(offer.vat_percent));

  return (
    <div className="min-h-screen bg-background px-5 py-14 font-sans">
      <article className="mx-auto max-w-3xl">
        <BrandLogo className="h-9 w-auto max-w-[250px]" />
        <header className="mt-8">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Offer {offer.offer_number}
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-wide lg:text-5xl">{offer.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            For {offer.customer_name ?? "you"} · Rental {formatDate(offer.rental_start)} –{" "}
            {formatDate(offer.rental_end)}
            {offer.valid_until ? ` · Valid until ${formatDate(offer.valid_until)}` : ""}
          </p>
        </header>

        {offer.intro && (
          <p className="mt-8 rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
            {offer.intro}
          </p>
        )}

        <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Days</th>
                <th className="px-4 py-3 text-right font-medium">Price/day</th>
                <th className="px-4 py-3 text-right font-medium">Sum</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border/70">
                  <td className="px-4 py-3">{item.description}</td>
                  <td className="px-4 py-3 text-right">{item.quantity}</td>
                  <td className="px-4 py-3 text-right">{item.days}</td>
                  <td className="px-4 py-3 text-right">{formatSek(Number(item.unit_price))}</td>
                  <td className="px-4 py-3 text-right">
                    {formatSek(Number(item.quantity) * Number(item.days) * Number(item.unit_price))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <dl className="mt-6 grid gap-2 rounded-2xl border border-border bg-card p-5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatSek(totals.subtotal)}</dd>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount ({offer.discount_percent}%)</dt>
              <dd>-{formatSek(totals.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">VAT ({offer.vat_percent}%)</dt>
            <dd>{formatSek(totals.vat)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-3 font-display text-3xl">
            <dt>Total</dt>
            <dd className="text-primary">{formatSek(totals.total)}</dd>
          </div>
        </dl>

        {offer.terms && (
          <section className="mt-6">
            <h2 className="font-display text-xl tracking-wide">Terms</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{offer.terms}</p>
          </section>
        )}

        <p className="mt-10 text-sm text-muted-foreground">
          Questions or ready to book? Reply to the email this offer came with and we will confirm
          the reservation.
        </p>
      </article>
    </div>
  );
}
