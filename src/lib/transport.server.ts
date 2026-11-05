import { sha256Hex } from "@/lib/clientFingerprint";
import {
  nextRushHourDeparture,
  normalizeAddress,
  pendingTransport,
  transportTotal,
  type RouteLeg,
  type TransportQuote,
  type WarehouseRates,
} from "@/lib/transportPricing";

/** Default responsible staff (Marcus) whose hourly rate prices website transport. */
export const DEFAULT_STAFF_ID = "00000000-0000-4000-a000-0000000000a1";
const CACHE_TTL_MS = 24 * 3600 * 1000;
const ROUTE_CACHE_VERSION = "routes-v1";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

type Warehouse = WarehouseRates & {
  address: string;
  lat: number | null;
  lng: number | null;
};

function parseDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(value);
  return m ? Number(m[1]) : null;
}

/** Maps a Routes API response body to a leg, or null when no usable route came back. */
export function legFromRoutesResponse(body: unknown): RouteLeg | null {
  const route = (body as { routes?: { distanceMeters?: number; duration?: string }[] })
    ?.routes?.[0];
  if (!route) return null;
  const duration = parseDuration(route.duration);
  if (duration == null) return null;
  // Protobuf JSON omits zero values: a valid route without distanceMeters is 0 m.
  return { distance_m: Number(route.distanceMeters ?? 0), duration_s: duration };
}

async function fetchRoute(origin: Warehouse, destination: string): Promise<RouteLeg | null> {
  const key = process.env["GOOGLE_MAPS_API_KEY"];
  if (!key) return null;
  const body = JSON.stringify({
    origin:
      origin.lat != null && origin.lng != null
        ? { location: { latLng: { latitude: Number(origin.lat), longitude: Number(origin.lng) } } }
        : { address: origin.address },
    destination: { address: destination },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
    trafficModel: "PESSIMISTIC",
    departureTime: nextRushHourDeparture(),
    regionCode: "se",
    languageCode: "sv",
  });
  const fieldMask = "routes.distanceMeters,routes.duration";

  // Google Maps connector key: always routed through the Lovable connector gateway.
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) return null;
  const res = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": key,
      "X-Goog-FieldMask": fieldMask,
    },
    body,
  });
  if (!res.ok) {
    console.error(`transport: routes request failed [${res.status}]: ${await res.text()}`);
    return null;
  }
  return legFromRoutesResponse(await res.json());
}

/**
 * Transport for delivering the given products to an address. Warehouses come from the
 * products (never from the client). Never throws; failures return a pending quote.
 */
export async function computeTransport(opts: {
  address: string;
  equipmentIds: string[];
  hourlyRateSek?: number;
  staffId?: string;
}): Promise<TransportQuote> {
  try {
    const address = opts.address.trim();
    if (normalizeAddress(address).length < 5) return pendingTransport("invalid_address");
    if (!process.env["GOOGLE_MAPS_API_KEY"]) return pendingTransport("missing_key");
    const ids = [...new Set(opts.equipmentIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (!ids.length) return pendingTransport("empty_cart");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: equipment, error: eqErr } = await supabaseAdmin
      .from("equipment")
      .select("warehouse_id")
      .in("id", ids.slice(0, 100));
    if (eqErr) throw eqErr;
    const warehouseIds = [...new Set((equipment ?? []).map((e) => e.warehouse_id))];
    if (!warehouseIds.length) return pendingTransport("no_warehouse");

    const { data: warehouses, error: whErr } = await supabaseAdmin
      .from("warehouses")
      .select(
        "id, name, address, lat, lng, loading_time_hours, rig_up_time_hours, truck_cost_per_10km_sek, staff_per_delivery",
      )
      .in("id", warehouseIds)
      .eq("is_active", true);
    if (whErr) throw whErr;
    if (!warehouses?.length) return pendingTransport("no_warehouse");

    let rate = opts.hourlyRateSek;
    if (rate == null) {
      const { data: staff } = await supabaseAdmin
        .from("staff")
        .select("hourly_rate_sek")
        .eq("id", opts.staffId ?? DEFAULT_STAFF_ID)
        .maybeSingle();
      rate = Number(staff?.hourly_rate_sek ?? 600);
    }

    const normalized = normalizeAddress(address);
    const legs: { warehouse: WarehouseRates; leg: RouteLeg }[] = [];
    for (const raw of warehouses) {
      const w: Warehouse = {
        id: raw.id,
        name: raw.name,
        address: raw.address,
        lat: raw.lat == null ? null : Number(raw.lat),
        lng: raw.lng == null ? null : Number(raw.lng),
        loading_time_hours: Number(raw.loading_time_hours),
        rig_up_time_hours: Number(raw.rig_up_time_hours),
        truck_cost_per_10km_sek: Number(raw.truck_cost_per_10km_sek),
        staff_per_delivery: Number(raw.staff_per_delivery),
      };
      const cacheKey = await sha256Hex(
        `${ROUTE_CACHE_VERSION}|${normalized}|${w.id}|${w.address}|${w.lat ?? ""},${w.lng ?? ""}`,
      );
      const { data: cached } = await supabaseAdmin
        .from("transport_cache")
        .select("response, expires_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      let leg: RouteLeg | null = null;
      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        leg = cached.response as unknown as RouteLeg;
      } else {
        leg = await fetchRoute(w, address);
        if (!leg) return pendingTransport("route_failed");
        await supabaseAdmin.from("transport_cache").upsert({
          cache_key: cacheKey,
          response: leg as never,
          expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        });
      }
      legs.push({ warehouse: w, leg });
    }

    const breakdown = transportTotal(legs, rate);
    return {
      status: "quoted",
      amount: breakdown.total,
      breakdown,
      distance_m: legs.reduce((s, l) => s + l.leg.distance_m, 0),
      duration_s: legs.reduce((s, l) => s + l.leg.duration_s, 0),
    };
  } catch (error) {
    console.error("transport: quote failed", error instanceof Error ? error.message : error);
    return pendingTransport("error");
  }
}

/** Order/calculation columns for a quote. */
export function transportColumns(quote: TransportQuote) {
  if (quote.status === "quoted")
    return {
      transport_status: "quoted",
      transport_amount: quote.amount,
      transport_breakdown: quote.breakdown as never,
      transport_distance_m: quote.distance_m,
      transport_duration_s: quote.duration_s,
    };
  if (quote.status === "waived")
    return {
      transport_status: "waived",
      transport_amount: 0,
      transport_breakdown: null,
      transport_distance_m: null,
      transport_duration_s: null,
    };
  return {
    transport_status: "pending",
    transport_amount: null,
    transport_breakdown: null,
    transport_distance_m: null,
    transport_duration_s: null,
  };
}
