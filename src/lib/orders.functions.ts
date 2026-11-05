import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{16,64}$/),
});

export type PublicOrder = {
  order_number: string;
  status: string;
  starts_on: string;
  ends_on: string;
  shipping_method: string;
  shipping_cost: number;
  /** null = transport still pending confirmation. */
  transport_amount: number | null;
  discount_percent: number;
  vat_percent: number;
  delivery_address: string | null;
  delivery_postal_code: string | null;
  delivery_city: string | null;
  customer_note: string | null;
  customer_name: string | null;
  lines: { description: string; quantity: number; days: number; unit_price: number }[];
};

/**
 * Customer-facing order lookup. The share token is the only credential, so the
 * response is projected down to non-sensitive fields.
 */
export const getOrderByToken = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => tokenSchema.parse(input))
  .handler(async ({ data }): Promise<PublicOrder | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, starts_on, ends_on, shipping_method, shipping_cost, transport_amount, discount_percent, vat_percent, delivery_address, delivery_postal_code, delivery_city, customer_note, customers(name)",
      )
      .eq("share_token", data.token)
      .maybeSingle();
    if (error) throw error;
    if (!order) return null;

    const { data: lines, error: linesError } = await supabaseAdmin
      .from("order_lines")
      .select("description, quantity, days, unit_price")
      .eq("order_id", order.id)
      .order("sort_order");
    if (linesError) throw linesError;

    const customer = order.customers as { name: string } | null;
    return {
      order_number: order.order_number,
      status: order.status,
      starts_on: order.starts_on,
      ends_on: order.ends_on,
      shipping_method: order.shipping_method,
      shipping_cost: Number(order.shipping_cost),
      transport_amount: order.transport_amount == null ? null : Number(order.transport_amount),
      discount_percent: Number(order.discount_percent),
      vat_percent: Number(order.vat_percent),
      delivery_address: order.delivery_address,
      delivery_postal_code: order.delivery_postal_code,
      delivery_city: order.delivery_city,
      customer_note: order.customer_note,
      customer_name: customer?.name ?? null,
      lines: (lines ?? []).map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        days: Number(l.days),
        unit_price: Number(l.unit_price),
      })),
    };
  });
