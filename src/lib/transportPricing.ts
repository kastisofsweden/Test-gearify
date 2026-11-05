/**
 * Pure transport pricing. One delivery per warehouse involved in the cart:
 * staff drive a round trip, load and rig up; the truck is charged per started 10 km.
 */

export type WarehouseRates = {
  id: string;
  name: string;
  loading_time_hours: number;
  rig_up_time_hours: number;
  truck_cost_per_10km_sek: number;
  staff_per_delivery: number;
};

export type RouteLeg = {
  /** One-way driving distance in metres. */
  distance_m: number;
  /** One-way driving time (pessimistic, in traffic) in seconds. */
  duration_s: number;
};

export type WarehouseTransport = {
  warehouse_id: string;
  warehouse_name: string;
  distance_m: number;
  duration_s: number;
  staff_hours: number;
  staff_cost: number;
  truck_cost: number;
  subtotal: number;
};

export type TransportBreakdown = {
  hourly_rate_sek: number;
  warehouses: WarehouseTransport[];
  total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function warehouseTransport(
  warehouse: WarehouseRates,
  leg: RouteLeg,
  hourlyRateSek: number,
): WarehouseTransport {
  const distance = Math.max(0, leg.distance_m);
  const duration = Math.max(0, leg.duration_s);
  const roundTripHours = 2 * (duration / 3600);
  const staffHours = warehouse.loading_time_hours + warehouse.rig_up_time_hours + roundTripHours;
  const staffCost = staffHours * Math.max(1, warehouse.staff_per_delivery) * hourlyRateSek;
  const roundTripKm = 2 * (distance / 1000);
  // Small epsilon so floating noise (60.0000001 km) doesn't add an extra 10 km block.
  const blocks = Math.max(0, Math.ceil(roundTripKm / 10 - 1e-9));
  const truckCost = blocks * warehouse.truck_cost_per_10km_sek;
  return {
    warehouse_id: warehouse.id,
    warehouse_name: warehouse.name,
    distance_m: distance,
    duration_s: duration,
    staff_hours: round2(staffHours),
    staff_cost: round2(staffCost),
    truck_cost: round2(truckCost),
    subtotal: Math.round(staffCost + truckCost),
  };
}

export function transportTotal(
  legs: { warehouse: WarehouseRates; leg: RouteLeg }[],
  hourlyRateSek: number,
): TransportBreakdown {
  const warehouses = legs.map(({ warehouse, leg }) =>
    warehouseTransport(warehouse, leg, hourlyRateSek),
  );
  return {
    hourly_rate_sek: hourlyRateSek,
    warehouses,
    total: warehouses.reduce((sum, w) => sum + w.subtotal, 0),
  };
}

/**
 * Departure used for the traffic estimate: the next weekday at 16:30 Stockholm time
 * (today if it is a weekday and still before 16:30). Returned as an RFC 3339 UTC string.
 */
export function nextRushHourDeparture(now: Date = new Date()): string {
  const tz = "Europe/Stockholm";
  const parts = (d: Date) => {
    const f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
    return {
      y: Number(get("year")),
      m: Number(get("month")),
      d: Number(get("day")),
      hm: Number(get("hour")) * 60 + Number(get("minute")),
      wd: get("weekday"),
    };
  };
  // Offset of Stockholm vs UTC at a given instant, in minutes.
  const offsetAt = (d: Date) => {
    const p = parts(d);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, Math.floor(p.hm / 60), p.hm % 60);
    return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
  };
  let cursor = new Date(now.getTime());
  for (let i = 0; i < 8; i++) {
    const p = parts(cursor);
    const weekday = p.wd !== "Sat" && p.wd !== "Sun";
    if (weekday && (i > 0 || p.hm < 16 * 60 + 30)) {
      const localMs = Date.UTC(p.y, p.m - 1, p.d, 16, 30);
      const guess = new Date(localMs);
      const utc = new Date(localMs - offsetAt(guess) * 60000);
      return utc.toISOString().replace(/\.\d{3}Z$/, "Z");
    }
    cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
  }
  return now.toISOString();
}

export type TransportQuote =
  | {
      status: "quoted";
      amount: number;
      breakdown: TransportBreakdown;
      distance_m: number;
      duration_s: number;
    }
  | {
      status: "pending";
      amount: null;
      breakdown: null;
      messageSv: string;
      messageEn: string;
      reason: string;
    }
  | { status: "waived"; amount: 0; breakdown: null };

export const TRANSPORT_PENDING_SV = "Transport is calculated and confirmed in the quote";
export const TRANSPORT_PENDING_EN = "Transport is calculated and confirmed in the quote";

/** Never throws: any failure becomes a pending quote the storefront can show. */
export function pendingTransport(reason: string): TransportQuote {
  return {
    status: "pending",
    amount: null,
    breakdown: null,
    messageSv: TRANSPORT_PENDING_SV,
    messageEn: TRANSPORT_PENDING_EN,
    reason,
  };
}

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}
