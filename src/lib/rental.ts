export type Equipment = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  daily_price: number;
  image_url: string | null;
  tag: string | null;
  is_active: boolean;
  sort_order: number;
  item_kind: string;
  parent_id: string | null;
  variant_label: string | null;
  rate_unit: string;
  fixed_price: number;
  deposit_type: string;
  deposit_value: number;
  tax_rate_id: string | null;
  barcode: string | null;
  tracking: string;
};

export type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string | null;
  rental_start: string | null;
  rental_end: string | null;
  source: string;
  status: string;
  notes: string | null;
  followup_date: string | null;
  created_at: string;
};

export type Offer = {
  id: string;
  lead_id: string | null;
  offer_number: string;
  title: string;
  customer_name: string | null;
  customer_email: string | null;
  rental_start: string | null;
  rental_end: string | null;
  discount_percent: number;
  vat_percent: number;
  valid_until: string | null;
  terms: string | null;
  intro: string | null;
  internal_notes: string | null;
  status: string;
  share_token: string;
  sent_at: string | null;
  created_at: string;
};

export type OfferItem = {
  id: string;
  offer_id: string;
  equipment_id: string | null;
  description: string;
  quantity: number;
  days: number;
  unit_price: number;
  sort_order: number;
};

export const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost"] as const;

export const OFFER_STATUSES = ["draft", "sent", "accepted", "declined"] as const;

export const formatSek = (value: number) =>
  `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(value)} SEK`;

export const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("sv-SE") : "—";

export function offerTotals(
  items: Pick<OfferItem, "quantity" | "days" | "unit_price">[],
  discountPercent = 0,
  vatPercent = 25,
) {
  const subtotal = items.reduce(
    (sum, i) => sum + Number(i.quantity) * Number(i.days) * Number(i.unit_price),
    0,
  );
  const discount = (subtotal * Number(discountPercent || 0)) / 100;
  const net = subtotal - discount;
  const vat = (net * Number(vatPercent || 0)) / 100;
  return { subtotal, discount, net, vat, total: net + vat };
}
