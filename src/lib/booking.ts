import { supabase } from "@/integrations/supabase/client";
import type { Cart } from "@/lib/cart";
import { rentalDays } from "@/lib/cart";
import type { Lang } from "@/lib/site";

export const ORDER_STATUSES = [
  "pending",
  "draft",
  "reserved",
  "picked_up",
  "returned",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatus, { sv: string; en: string }> = {
  pending: { sv: "Väntar på bekräftelse", en: "Pending confirmation" },
  draft: { sv: "Utkast", en: "Draft" },
  reserved: { sv: "Reserverad", en: "Reserved" },
  picked_up: { sv: "Utlämnad", en: "Picked up" },
  returned: { sv: "Återlämnad", en: "Returned" },
  completed: { sv: "Avslutad", en: "Completed" },
  cancelled: { sv: "Avbokad", en: "Cancelled" },
};

/** Allowed transitions, mirroring the database status machine. */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ["reserved", "cancelled"],
  draft: ["reserved", "cancelled"],
  reserved: ["picked_up", "cancelled", "draft"],
  picked_up: ["returned"],
  returned: ["completed", "picked_up"],
  completed: [],
  cancelled: ["draft"],
};

export const STOCK_STATUS_LABEL: Record<string, string> = {
  in_stock: "In stock",
  with_customer: "With customer",
  service: "Service",
  damaged: "Damaged",
};

export type BookableItem = {
  id: string;
  name: string;
  daily_price: number;
  image_url: string | null;
  page_type: string | null;
  page_slug: string | null;
  tracking: string;
  quantity: number;
  item_kind: string;
};

export type BundleComponent = {
  id: string;
  name: string;
  image_url: string | null;
  quantity: number;
};

export type ShippingZone = {
  id: string;
  name: string;
  cities: string[];
  postal_prefixes: string[];
  base_fee: number;
  per_km: number;
  distance_km: number;
  is_active: boolean;
  sort_order: number;
};

export async function fetchBookable(pageType: "product" | "kit", slug: string) {
  const { data, error } = await supabase
    .from("equipment")
    .select("id, name, daily_price, image_url, page_type, page_slug, tracking, quantity, item_kind")
    .eq("page_type", pageType)
    .eq("page_slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return (data as BookableItem | null) ?? null;
}

export async function fetchBundleComponents(parentId: string) {
  const { data: links, error: linksError } = await supabase
    .from("product_components")
    .select("child_equipment_id, quantity")
    .eq("parent_equipment_id", parentId);
  if (linksError) throw linksError;
  if (!links?.length) return [] as BundleComponent[];

  const ids = links.map((link) => link.child_equipment_id);
  const { data: products, error: productsError } = await supabase
    .from("equipment")
    .select("id, name, image_url")
    .in("id", ids);
  if (productsError) throw productsError;

  const productById = new Map((products ?? []).map((product) => [product.id, product]));
  return links.flatMap((link) => {
    const product = productById.get(link.child_equipment_id);
    return product
      ? [
          {
            id: product.id,
            name: product.name,
            image_url: product.image_url,
            quantity: link.quantity,
          },
        ]
      : [];
  });
}

export async function fetchAvailability(
  equipmentId: string,
  startsOn: string,
  endsOn: string,
  excludeOrder?: string | null,
) {
  const { data, error } = await supabase.rpc("available_quantity", {
    _equipment_id: equipmentId,
    _start: startsOn,
    _end: endsOn,
    ...(excludeOrder ? { _exclude_order: excludeOrder } : {}),
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchZones() {
  const { data, error } = await supabase
    .from("shipping_zones")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ShippingZone[];
}

export async function quoteShipping(
  method: "pickup" | "delivery",
  input: { zoneId?: string | null; postal?: string; city?: string },
) {
  const { data, error } = await supabase.rpc("shipping_cost_for", {
    _method: method,
    ...(input.zoneId ? { _zone_id: input.zoneId } : {}),
    ...(input.postal ? { _postal: input.postal } : {}),
    ...(input.city ? { _city: input.city } : {}),
  });
  if (error) throw error;
  return (data ?? { cost: 0, zone_id: null, zone_name: null }) as {
    cost: number;
    zone_id: string | null;
    zone_name: string | null;
  };
}

/**
 * Move an order to a new status. A pending website request becomes reserved only
 * through the confirm_order RPC, which re-checks availability under row locks.
 */
export async function changeOrderStatus(id: string, from: string, to: OrderStatus) {
  if ((from === "pending" || from === "draft") && to === "reserved") {
    const { error } = await supabase.rpc("confirm_order", { _order_id: id });
    if (error) throw new Error(orderActionError(error.message));
    return;
  }
  const { error } = await supabase.from("orders").update({ status: to }).eq("id", id);
  if (error) throw new Error(orderActionError(error.message));
}

/** Back-office (English) wording for order status errors. */
export function orderActionError(message: string) {
  const match = /unavailable:([^:]*):(\d+)/.exec(message);
  if (match)
    return `Not enough stock for ${match[1]}: only ${match[2]} left for these dates. The order stays pending.`;
  if (message.includes("order_not_pending")) return "This order is no longer pending or draft.";
  if (message.includes("use_confirm_order"))
    return "Use Confirm to reserve a pending or draft order.";
  if (message.includes("forbidden")) return "You do not have permission to change this order.";
  return message;
}

/** Translate a database exception into a message the customer understands. */
export function bookingErrorMessage(message: string, lang: Lang) {
  const sv = lang === "sv";
  if (message.includes("unavailable:")) {
    const parts = message.split("unavailable:")[1]?.split(":") ?? [];
    const name = parts[0] ?? "";
    const left = parts[1] ?? "0";
    return sv
      ? `${name} finns bara i ${left} st under den perioden. Ändra antal eller datum.`
      : `Only ${left} of ${name} available for those dates. Adjust quantity or dates.`;
  }
  if (message.includes("min_rental_days")) {
    const days = message.split(":")[1] ?? "1";
    return sv
      ? `Minsta hyresperiod är ${days} dag(ar).`
      : `Minimum rental period is ${days} day(s).`;
  }
  if (message.includes("lead_time_days")) {
    const days = message.split(":")[1] ?? "1";
    return sv
      ? `Bokning måste göras minst ${days} dag(ar) i förväg.`
      : `Bookings must be made at least ${days} day(s) in advance.`;
  }
  if (message.includes("invalid_dates"))
    return sv ? "Kontrollera datumen." : "Please check the dates.";
  if (message.includes("invalid_email"))
    return sv ? "Ange en giltig e-postadress." : "Enter a valid email.";
  if (message.includes("invalid_name")) return sv ? "Ange ditt namn." : "Enter your name.";
  if (message.includes("empty_cart")) return sv ? "Varukorgen är tom." : "Your cart is empty.";
  if (message.includes("too_far_ahead"))
    return sv ? "Datumet ligger för långt fram." : "That date is too far ahead.";
  if (message.includes("too_fast"))
    return sv
      ? "Det gick lite för snabbt. Vänta några sekunder och försök igen."
      : "That was a little fast. Wait a few seconds and try again.";
  if (message.includes("rate_limited"))
    return sv
      ? "Vi har tagit emot många förfrågningar från dig. Försök igen senare eller kontakta oss."
      : "We have received many requests from you. Try again later or contact us.";
  if (message.includes("too_many_items"))
    return sv ? "Högst 20 olika artiklar per bokning." : "At most 20 different items per booking.";
  if (message.includes("too_many_units"))
    return sv
      ? "Högst 200 enheter per bokning. Kontakta oss för större beställningar."
      : "At most 200 units per booking. Contact us for larger orders.";
  if (message.includes("invalid_quantity"))
    return sv ? "Kontrollera antalet." : "Please check the quantities.";
  if (message.includes("unknown_item"))
    return sv
      ? "En artikel i varukorgen finns inte längre."
      : "An item in your cart is no longer available.";
  return sv
    ? "Bokningen kunde inte skapas. Försök igen."
    : "The booking could not be created. Please try again.";
}

export type Totals = {
  subtotal: number;
  discount: number;
  shipping: number;
  net: number;
  vat: number;
  total: number;
};

export function cartTotals(
  cart: Cart,
  options: { shipping?: number; discountPercent?: number; vatPercent?: number } = {},
): Totals {
  const days = rentalDays(cart.startsOn, cart.endsOn);
  const subtotal = cart.items.reduce((sum, i) => sum + i.dailyPrice * i.quantity * days, 0);
  return lineTotals(subtotal, options);
}

export function lineTotals(
  subtotal: number,
  options: { shipping?: number; discountPercent?: number; vatPercent?: number } = {},
): Totals {
  const discount = (subtotal * (options.discountPercent ?? 0)) / 100;
  const shipping = options.shipping ?? 0;
  const net = subtotal - discount + shipping;
  const vat = (net * (options.vatPercent ?? 25)) / 100;
  return { subtotal, discount, shipping, net, vat, total: net + vat };
}

export const money = (value: number) =>
  `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(Math.round(value))} kr`;

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const addDaysISO = (iso: string, days: number) => {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
