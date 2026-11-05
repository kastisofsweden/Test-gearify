import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Cart } from "@/lib/cart";
import { rentalDays } from "@/lib/cart";

export type PriceQuote = {
  days: number;
  units: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
  deposit: number;
  tax_percent: number;
  tax: number;
  total: number;
  rate_unit: string;
  item_kind: string;
  /** Rental before commission (subtotal includes commission). */
  base_subtotal?: number | undefined;
  commission_amount?: number | undefined;
};

export const RATE_UNITS = ["hour", "day", "week", "month", "fixed"] as const;
export const ITEM_KINDS = ["rental", "service", "bundle"] as const;
export const DEPOSIT_TYPES = ["none", "fixed", "percent"] as const;

/** Authoritative price for one item and period, calculated in the database. */
export async function fetchPrice(
  equipmentId: string,
  startsOn: string,
  endsOn: string,
  quantity: number,
): Promise<PriceQuote | null> {
  const { data, error } = await supabase.rpc("price_for", {
    _equipment_id: equipmentId,
    _start: startsOn,
    _end: endsOn,
    _qty: quantity,
  });
  if (error) throw error;
  const quote = data as unknown as PriceQuote | { error: string } | null;
  if (!quote || "error" in quote) return null;
  return {
    ...quote,
    units: Number(quote.units),
    unit_price: Number(quote.unit_price),
    subtotal: Number(quote.subtotal),
    deposit: Number(quote.deposit),
    tax_percent: Number(quote.tax_percent),
    tax: Number(quote.tax),
    total: Number(quote.total),
    base_subtotal: quote.base_subtotal == null ? undefined : Number(quote.base_subtotal),
    commission_amount: Number(quote.commission_amount ?? 0),
  };
}

export type AvailabilityTone = "unknown" | "green" | "amber" | "red";

/** Colour coding used on product pages, cart and back office. */
export function availabilityTone(available: number | undefined, requested = 1): AvailabilityTone {
  if (typeof available !== "number") return "unknown";
  if (available <= 0 || available < requested) return "red";
  if (available <= 2 || available <= requested + 1) return "amber";
  return "green";
}

export const TONE_TEXT: Record<AvailabilityTone, string> = {
  unknown: "text-muted-foreground",
  green: "text-success",
  amber: "text-warning",
  red: "text-destructive",
};

export const TONE_DOT: Record<AvailabilityTone, string> = {
  unknown: "bg-muted-foreground",
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-destructive",
};

export type CartQuote = {
  lines: Record<string, PriceQuote>;
  subtotal: number;
  deposit: number;
  vat: number;
};

/** Price every cart line through the database engine (tiers, calendar rules, deposits). */
export function useCartQuote(cart: Cart) {
  const days = rentalDays(cart.startsOn, cart.endsOn);
  return useQuery<CartQuote>({
    queryKey: [
      "cart-quote",
      cart.startsOn,
      cart.endsOn,
      cart.items.map((i) => `${i.equipmentId}:${i.quantity}`).join(","),
    ],
    enabled: cart.items.length > 0 && days > 0,
    queryFn: async () => {
      const quotes = await Promise.all(
        cart.items.map(async (item) => ({
          id: item.equipmentId,
          quote: await fetchPrice(item.equipmentId, cart.startsOn, cart.endsOn, item.quantity),
        })),
      );
      const lines: Record<string, PriceQuote> = {};
      let subtotal = 0;
      let deposit = 0;
      let vat = 0;
      for (const entry of quotes) {
        if (!entry.quote) continue;
        lines[entry.id] = entry.quote;
        subtotal += entry.quote.subtotal;
        deposit += entry.quote.deposit;
        vat += entry.quote.tax;
      }
      return { lines, subtotal, deposit, vat };
    },
  });
}

export type QuotedTotals = {
  subtotal: number;
  shipping: number;
  vat: number;
  total: number;
  deposit: number;
};

/** Add shipping (standard VAT) to a quoted cart. */
export function quotedTotals(
  quote: CartQuote | undefined,
  shipping = 0,
  shippingVatPercent = 25,
): QuotedTotals {
  const subtotal = quote?.subtotal ?? 0;
  const vat = (quote?.vat ?? 0) + (shipping * shippingVatPercent) / 100;
  return {
    subtotal,
    shipping,
    vat,
    total: subtotal + shipping + vat,
    deposit: quote?.deposit ?? 0,
  };
}
