import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { clientFingerprint } from "@/lib/clientFingerprint";

const bookingSchema = z.object({
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customer_name: z.string().max(200),
  customer_email: z.string().max(254),
  customer_phone: z.string().max(60).optional(),
  customer_company: z.string().max(200).optional(),
  shipping_method: z.enum(["pickup", "delivery"]),
  shipping_zone_id: z.string().uuid().nullish(),
  delivery_address: z.string().max(300).optional(),
  delivery_postal_code: z.string().max(30).optional(),
  delivery_city: z.string().max(120).optional(),
  customer_note: z.string().max(4000).optional(),
  /** Honeypot: real visitors never see or fill this field. */
  website: z.string().max(500).optional(),
  /** Epoch ms when the checkout form was first shown. */
  form_started_at: z.number().int().nonnegative(),
  items: z
    .array(z.object({ equipment_id: z.string().max(64), quantity: z.number().int() }))
    .max(100),
});

export type BookingPayload = z.infer<typeof bookingSchema>;

/** Error codes the booking RPC raises that are safe to show to customers. */
const PUBLIC_ERRORS = [
  "unavailable:",
  "min_rental_days",
  "lead_time_days",
  "invalid_dates",
  "invalid_email",
  "invalid_name",
  "empty_cart",
  "too_far_ahead",
  "too_fast",
  "rate_limited",
  "too_many_items",
  "too_many_units",
  "invalid_quantity",
  "unknown_item",
];

/**
 * Website booking. Runs on the server so the client IP is known; only a salted
 * hash of it is stored (orders.client_fingerprint) for rate limiting. The RPC is
 * executable by the service role only, so browsers cannot skip these checks.
 */
export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((input: BookingPayload) => bookingSchema.parse(input))
  .handler(async ({ data }) => {
    // Fails closed (booking_unavailable) when the salt secret is missing.
    const client_fingerprint = await clientFingerprint("booking");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("create_booking", {
      _payload: { ...data, client_fingerprint } as never,
    });
    if (error) {
      const known = PUBLIC_ERRORS.some((code) => error.message.includes(code));
      if (!known) console.error("create_booking failed", error.message);
      throw new Error(known ? error.message : "booking_failed");
    }
    const order = result as unknown as {
      id: string;
      order_number: string;
      share_token: string;
      status: string;
    };

    // Transport is recomputed here from the products' warehouses; a client amount is never
    // trusted. Maps failures leave it pending and the booking still succeeds.
    try {
      const { computeTransport, transportColumns } = await import("@/lib/transport.server");
      const quote =
        data.shipping_method === "delivery"
          ? await computeTransport({
              address: [
                data.delivery_address,
                [data.delivery_postal_code, data.delivery_city].filter(Boolean).join(" "),
              ]
                .filter(Boolean)
                .join(", "),
              equipmentIds: data.items.map((i) => i.equipment_id),
            })
          : ({ status: "waived", amount: 0, breakdown: null } as const);
      await supabaseAdmin.from("orders").update(transportColumns(quote)).eq("id", order.id);
    } catch (transportError) {
      console.error(
        "booking: transport update failed",
        transportError instanceof Error ? transportError.message : transportError,
      );
    }
    return order;
  });
