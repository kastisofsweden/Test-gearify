// Shared helpers for the physical unit register (stock_items).

export const UNIT_STATUSES = [
  "in_stock",
  "with_customer",
  "service",
  "damaged",
  "retired",
] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const UNIT_STATUS_LABEL: Record<string, string> = {
  in_stock: "Available",
  with_customer: "Checked out",
  service: "In service",
  damaged: "Damaged",
  retired: "Retired",
};

export const UNIT_STATUS_TONE: Record<string, string> = {
  in_stock: "bg-primary/15 text-primary",
  with_customer: "bg-accent text-accent-foreground",
  service: "bg-secondary text-secondary-foreground",
  damaged: "bg-destructive/15 text-destructive",
  retired: "bg-muted text-muted-foreground",
};

/** Reporter role label. */
export const REPORTER_ROLE_LABEL: Record<string, string> = {
  customer: "renting customer",
  staff: "on-site staff",
};

export const MOVEMENT_LABEL: Record<string, string> = {
  created: "Created",
  check_out: "Checked out",
  check_in: "Checked in",
  status_change: "Status changed",
  sn_changed: "S/N changed",
};

export const MAX_UNITS_PER_CALL = 1000;
export const MAX_IMPORT_ROWS = 1000;
export const MAX_PRINT_IDS = 300;
export const FIELD_LIMITS = { product: 200, serial: 120, location: 200, note: 2000 } as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** e.g. batchName("manual", date) -> "manual-20261103-1032" */
export function batchName(prefix: string, date: Date = new Date()) {
  return `${prefix}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------- CSV ----

/** Detects ',' or ';' from the first line (outside quotes). */
export function detectSeparator(text: string): "," | ";" {
  const firstLine =
    text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .find((l) => l.trim() !== "") ?? "";
  let commas = 0;
  let semis = 0;
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ",") commas++;
    else if (!quoted && ch === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

/** Minimal RFC-4180-ish parser: quotes, escaped quotes, CRLF. Blank lines dropped. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const sep = detectSeparator(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const HEADER_ALIASES: Record<string, "product" | "serial" | "location" | "note"> = {
  product: "product",
  produkt: "product",
  sku: "product",
  item: "product",
  equipment: "product",
  serial: "serial",
  serial_number: "serial",
  "serial number": "serial",
  serienummer: "serial",
  location: "location",
  plats: "location",
  note: "note",
  notes: "note",
  anteckning: "note",
};

export type ImportProduct = { id: string; name: string; sku: string | null; item_kind: string };

export type ImportRow = {
  line: number;
  productInput: string;
  serial: string;
  location: string;
  note: string;
  product: ImportProduct | null;
  errors: string[];
};

export type ImportResult = { rows: ImportRow[]; globalErrors: string[]; hasHeader: boolean };

/**
 * Validates parsed CSV rows. `existingSerials` holds keys `${equipment_id}|${serial.toLowerCase()}`.
 */
export function validateImport(
  table: string[][],
  products: ImportProduct[],
  existingSerials: Set<string>,
): ImportResult {
  const globalErrors: string[] = [];
  if (table.length === 0)
    return { rows: [], globalErrors: ["The file is empty."], hasHeader: false };

  const first = (table[0] ?? []).map((c) => c.toLowerCase());
  const hasHeader = first.some((c) => HEADER_ALIASES[c] === "product");
  let columns: Record<"product" | "serial" | "location" | "note", number> = {
    product: 0,
    serial: 1,
    location: 2,
    note: 3,
  };
  if (hasHeader) {
    columns = { product: -1, serial: -1, location: -1, note: -1 };
    first.forEach((c, i) => {
      const key = HEADER_ALIASES[c];
      if (key && columns[key] === -1) columns[key] = i;
    });
  }
  const body = hasHeader ? table.slice(1) : table;
  if (body.length > MAX_IMPORT_ROWS) {
    globalErrors.push(
      `The file has ${body.length} rows; the maximum is ${MAX_IMPORT_ROWS} per import.`,
    );
  }

  const bySku = new Map<string, ImportProduct[]>();
  const byName = new Map<string, ImportProduct[]>();
  const byId = new Map<string, ImportProduct>();
  for (const p of products) {
    byId.set(p.id.toLowerCase(), p);
    if (p.sku) bySku.set(p.sku.toLowerCase(), [...(bySku.get(p.sku.toLowerCase()) ?? []), p]);
    byName.set(p.name.toLowerCase(), [...(byName.get(p.name.toLowerCase()) ?? []), p]);
  }

  const seen = new Map<string, number>();
  const cell = (r: string[], idx: number) => (idx >= 0 ? (r[idx] ?? "").trim() : "");

  const rows: ImportRow[] = body.map((r, i) => {
    const line = i + (hasHeader ? 2 : 1);
    const productInput = cell(r, columns.product);
    const serial = cell(r, columns.serial);
    const location = cell(r, columns.location);
    const note = cell(r, columns.note);
    const errors: string[] = [];
    let product: ImportProduct | null = null;

    if (!productInput) errors.push("Product is required");
    else if (productInput.length > FIELD_LIMITS.product) errors.push("Product value is too long");
    else {
      const key = productInput.toLowerCase();
      const matches = bySku.get(key) ?? byName.get(key) ?? (byId.has(key) ? [byId.get(key)!] : []);
      if (matches.length === 0) errors.push(`Unknown product "${productInput}"`);
      else if (matches.length > 1)
        errors.push(`"${productInput}" matches several products; use the SKU or id`);
      else {
        const match = matches[0] ?? null;
        product = match;
        if (match && (match.item_kind === "service" || match.item_kind === "bundle")) {
          errors.push(`${match.name} is a ${match.item_kind} and cannot have units`);
        }
      }
    }

    if (serial.length > FIELD_LIMITS.serial)
      errors.push(`Serial is longer than ${FIELD_LIMITS.serial} characters`);
    if (location.length > FIELD_LIMITS.location)
      errors.push(`Location is longer than ${FIELD_LIMITS.location} characters`);
    if (note.length > FIELD_LIMITS.note)
      errors.push(`Note is longer than ${FIELD_LIMITS.note} characters`);

    if (product && serial) {
      const key = `${product.id}|${serial.toLowerCase()}`;
      if (existingSerials.has(key))
        errors.push(`Serial ${serial} already exists for ${product.name}`);
      const firstLine = seen.get(key);
      if (firstLine !== undefined)
        errors.push(`Duplicate serial ${serial} (also on line ${firstLine})`);
      else seen.set(key, line);
    }

    return { line, productInput, serial, location, note, product, errors };
  });

  return { rows, globalErrors, hasHeader };
}

export type ImportGroup = {
  product: ImportProduct;
  location: string;
  withSerials: boolean;
  rows: ImportRow[];
};

/** One create_units call per product + location + (serials or not), max 1000 rows each. */
export function planImportGroups(rows: ImportRow[]): ImportGroup[] {
  const groups = new Map<string, ImportGroup>();
  for (const row of rows) {
    if (!row.product || row.errors.length) continue;
    const withSerials = row.serial !== "";
    const key = `${row.product.id}|${row.location.toLowerCase()}|${withSerials}`;
    const group = groups.get(key) ?? {
      product: row.product,
      location: row.location,
      withSerials,
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export const CSV_TEMPLATE = [
  "product;serial;location;note",
  "75″ LED-TV;SN-75-0001;Lager A hylla 3;",
  "75″ LED-TV;SN-75-0002;Lager A hylla 3;Liten repa på ramen",
  "Högtalarstativ;;Lager B;",
].join("\n");

/** Search params for the label print page; very large sets fall back to the batch name. */
export function printLabelsSearch(
  ids: string[],
  batch?: string | null,
): { ids?: string; batch?: string } | null {
  if (ids.length <= MAX_PRINT_IDS) return { ids: ids.join(",") };
  if (batch) return { batch };
  return null;
}

// ------------------------------------------------------------- scanning ----

export type MoveAction = "check_out" | "check_in";

/** Why a move would be unexpected for a unit in this status, or null when it is the normal flow. */
export function moveWarning(action: MoveAction, status: string): string | null {
  if (status === "retired") return "Retired";
  if (status === "damaged") return "Damaged";
  if (status === "service") return "In service";
  if (action === "check_out" && status !== "in_stock") return "Not available";
  if (action === "check_in" && status !== "with_customer") return "Not checked out";
  return null;
}

export const MOVE_PROBLEM_LABEL: Record<string, string> = {
  not_found: "Unit no longer exists",
  unit_retired: "Unit is retired",
  unit_in_service: "Unit is in service",
  unit_damaged: "Unit is damaged",
  already_checked_out: "Already checked out",
  already_checked_in: "Already checked in",
};

/** Same code within this window is ignored (camera re-reads, double wedge scans). */
export const SCAN_DEBOUNCE_MS = 2500;

export function isDuplicateScan(
  last: { code: string; at: number },
  code: string,
  now: number,
  windowMs: number = SCAN_DEBOUNCE_MS,
) {
  return last.code === code && now - last.at < windowMs;
}

const UNIT_ERRORS: Record<string, string> = {
  organization_prefix_missing:
    "The product's main organization has no S/N prefix yet. Set one under Organizations.",
  product_has_no_organization: "Choose a parent organization for the product first.",
  item_kind_not_trackable: "Services and bundles can't have physical units.",
  serial_code_immutable: "The S/N is assigned once and can't be changed.",
  serial_parts_immutable: "The S/N is assigned once and can't be changed.",
  serial_codes_pkey: "That S/N is already taken. Try again.",
  item_unit_limit: "An item can have at most 999 units (S/N …-XX999).",
  item_has_no_serial_base: "This item has no S/N base yet. Reload and try again.",
  item_on_orders: "This item is on orders, so it can't be deleted. Hide it from the shop instead.",
  unit_has_history:
    "This unit has been out on rent, so its history is kept. Set it to Retired instead.",
  forbidden: "You don't have permission to do that.",
};

/**
 * The order create_units issues S/N codes for an import: group by group, rows in file order inside each
 * group. Used to ask the database for a matching (non-binding) preview.
 */
export function importCreationOrder(
  groups: ImportGroup[],
): { line: number; equipmentId: string }[] {
  return groups.flatMap((g) => g.rows.map((r) => ({ line: r.line, equipmentId: g.product.id })));
}

/** Friendly text for errors raised while creating, changing or deleting units. */
export function unitErrorMessage(message: string): string {
  const history = /unit_has_rental_history:\s*([^"\n]+)/.exec(message);
  if (history) {
    return `Can't delete ${history[1]!.trim()} – these units have been out on rent, so their history is kept. Set them to Retired instead.`;
  }
  const key = Object.keys(UNIT_ERRORS).find((k) => message.includes(k));
  return key ? UNIT_ERRORS[key]! : message;
}
