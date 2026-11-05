import content from "@/content/site-content.json";
import { getOverride, overrideKey } from "@/lib/overrides";

export type Lang = "sv" | "en";

export type SectionItem = {
  title: string;
  body: string;
  image: string;
  link: string;
  price: string;
};

export type Section = {
  eyebrow: string;
  heading: string;
  body: string;
  items: SectionItem[];
};

export type PageContent = {
  eyebrow: string;
  h1: string;
  intro: string;
  meta_title: string;
  meta_description: string;
  included: string[];
  specs: { label: string; value: string }[];
  sections: Section[];
};

export type PageType =
  | "home"
  | "catalog"
  | "kits"
  | "venues"
  | "city"
  | "product"
  | "kit"
  | "category"
  | "venue"
  | "venue_type"
  | "landing"
  | "info";

export type SitePage = {
  type: PageType;
  slug: string;
  slug_sv?: string;
  category?: string;
  city?: string;
  path: { sv: string; en: string };
  image: string;
  price_from: number;
  price_unit: string;
  order: number;
  content: { sv: PageContent; en: PageContent };
};

export const PAGES = (content as { pages: SitePage[] }).pages;

const keyOf = (page: SitePage) => overrideKey(page.type, page.slug);

/** A page hidden in the back office disappears from every listing. */
export const isVisible = (page: SitePage) => getOverride(keyOf(page))?.is_active !== false;

export const byType = (type: PageType) =>
  PAGES.filter((p) => p.type === type && isVisible(p)).sort((a, b) => a.order - b.order);

/** Hero/card image, with the back-office override applied. */
export const imageOf = (page: SitePage) => {
  const image = getOverride(keyOf(page))?.image;
  return image && image.trim() ? image : page.image;
};

export function findPage(type: PageType, slug: string): SitePage | undefined {
  return PAGES.find((p) => p.type === type && (p.slug === slug || p.slug_sv === slug));
}

export const pageOf = (type: PageType) => PAGES.find((p) => p.type === type)!;

export const contentOf = (page: SitePage, lang: Lang): PageContent => {
  const patch = getOverride(keyOf(page))?.[lang];
  if (!patch) return page.content[lang];
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => typeof value === "string" && value.trim() !== ""),
  );
  return { ...page.content[lang], ...clean } as PageContent;
};

export const pathOf = (page: SitePage, lang: Lang) => page.path[lang];

/** Map a scraped internal link to the matching local route path. */
export function resolveLink(link: string, lang: Lang): string {
  if (!link) return "";
  const clean = link.replace(/\/$/, "") || "/";
  const hit = PAGES.find(
    (p) =>
      p.path.en === clean ||
      p.path.sv === clean ||
      (p.type === "category" && clean === `/equipment-category/${p.slug_sv ?? ""}`),
  );
  if (hit) return hit.path[lang];
  return clean.startsWith("/") ? clean : "";
}

export function pageHead(page: SitePage | undefined, lang: Lang) {
  if (!page) return { meta: [{ name: "robots", content: "noindex" }] };
  const c = contentOf(page, lang);
  const title = c.meta_title || c.h1;
  const description = c.meta_description || c.intro.slice(0, 155);
  const meta: Array<Record<string, string>> = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ];
  const image = imageOf(page);
  if (image.startsWith("https://")) {
    meta.push({ property: "og:image", content: image });
    meta.push({ name: "twitter:image", content: image });
  }
  return { meta };
}

export const priceFromOf = (page: SitePage) => {
  const price = getOverride(keyOf(page))?.price_from;
  return price === null || price === undefined ? page.price_from : Number(price);
};

export const priceLabel = (page: SitePage, lang: Lang) => {
  const price = priceFromOf(page);
  if (!price) return "";
  const value = new Intl.NumberFormat("sv-SE").format(price);
  return lang === "sv" ? `Från ${value} kr / vecka` : `From ${value} kr / week`;
};

type Dict = Record<string, { sv: string; en: string }>;

const DICT: Dict = {
  nav_rent: { sv: "Hyr utrustning", en: "Rent equipment" },
  nav_kits: { sv: "Paket", en: "Kits" },
  nav_venues: { sv: "Lokaler", en: "Venues" },
  nav_events: { sv: "Eventtyper", en: "Event types" },
  nav_about: { sv: "Om oss", en: "About" },
  nav_partner: { sv: "Partnerprogram", en: "Partner program" },
  nav_contact: { sv: "Kontakt", en: "Contact" },
  cta_quote: { sv: "Begär prisförslag", en: "Request a quote" },
  cta_browse: { sv: "Se utrustning", en: "Browse equipment" },
  included: { sv: "Det här ingår", en: "What's included" },
  specs: { sv: "Specifikationer", en: "Specifications" },
  products: { sv: "Utrustning", en: "Equipment" },
  kits: { sv: "Kompletta paket", en: "Complete kits" },
  categories: { sv: "Kategorier", en: "Categories" },
  venues_in: { sv: "Lokaler i Stockholm", en: "Venues in Stockholm" },
  venue_types: { sv: "Lokaltyper", en: "Venue types" },
  event_types: { sv: "Eventtyper", en: "Event types" },
  form_title: { sv: "Begär prisförslag", en: "Request a quote" },
  form_lead: {
    sv: "Skicka datum, lokal och antal skärmar – du får pris och bekräftad tillgänglighet, oftast samma arbetsdag.",
    en: "Send your dates, venue and screen count — you get pricing and confirmed availability, usually the same working day.",
  },
  form_name: { sv: "Namn", en: "Name" },
  form_company: { sv: "Företag", en: "Company" },
  form_email: { sv: "E-post", en: "Email" },
  form_phone: { sv: "Telefon", en: "Phone" },
  form_start: { sv: "Från datum", en: "From date" },
  form_end: { sv: "Till datum", en: "To date" },
  form_message: { sv: "Vad behöver du?", en: "What do you need?" },
  form_submit: { sv: "Skicka förfrågan", en: "Send request" },
  form_sending: { sv: "Skickar…", en: "Sending…" },
  form_ok: {
    sv: "Tack! Vi återkommer med prisförslag.",
    en: "Thank you! We'll come back with a quote.",
  },
  form_error: { sv: "Något gick fel. Försök igen.", en: "Something went wrong. Please try again." },
  from: { sv: "Från", en: "From" },
  read_more: { sv: "Läs mer", en: "Read more" },
  footer_company: {
    sv: "Uthyrning av AV-utrustning i hela Sverige.",
    en: "AV equipment dry hire across Sweden.",
  },
  footer_rights: { sv: "Alla rättigheter förbehållna.", en: "All rights reserved." },
  admin: { sv: "Backoffice", en: "Backoffice" },
  cart: { sv: "Varukorg", en: "Cart" },
  checkout: { sv: "Kassa", en: "Checkout" },
  book_now: { sv: "Boka utrustningen", en: "Book this equipment" },
  add_to_cart: { sv: "Lägg i varukorgen", en: "Add to cart" },
  added_to_cart: { sv: "Tillagd i varukorgen", en: "Added to cart" },
  pick_dates: {
    sv: "Välj hyresperiod för att se tillgänglighet.",
    en: "Pick your dates to see availability.",
  },
  checking: { sv: "Kontrollerar tillgänglighet…", en: "Checking availability…" },
  available_now: { sv: "st tillgängliga", en: "available" },
  none_available: { sv: "Inget ledigt under perioden", en: "Nothing available for those dates" },
  quantity: { sv: "Antal", en: "Quantity" },
  days_label: { sv: "dygn", en: "days" },
  per_day: { sv: "per dygn", en: "per day" },
  price_excl_vat: { sv: "Priser exkl. moms", en: "Prices excl. VAT" },
  subtotal: { sv: "Delsumma", en: "Subtotal" },
  shipping: { sv: "Frakt", en: "Shipping" },
  vat: { sv: "Moms", en: "VAT" },
  total: { sv: "Totalt", en: "Total" },
  empty_cart: { sv: "Varukorgen är tom.", en: "Your cart is empty." },
  continue_shopping: { sv: "Fortsätt handla", en: "Continue shopping" },
  to_checkout: { sv: "Till kassan", en: "Go to checkout" },
  remove: { sv: "Ta bort", en: "Remove" },
  rental_period: { sv: "Hyresperiod", en: "Rental period" },
  pickup: { sv: "Upphämtning i Örebro", en: "Pick up in Örebro" },
  pickup_note: {
    sv: "Kostnadsfritt på vårt lager, Nikolaigatan 10.",
    en: "Free at our warehouse, Nikolaigatan 10.",
  },
  delivery: { sv: "Leverans till adress", en: "Delivery to address" },
  delivery_note: {
    sv: "Fraktpris räknas ut från din ort.",
    en: "Shipping is calculated from your location.",
  },
  customer_details: { sv: "Dina uppgifter", en: "Your details" },
  address: { sv: "Adress", en: "Address" },
  postal_code: { sv: "Postnummer", en: "Postal code" },
  city: { sv: "Ort", en: "City" },
  note: { sv: "Meddelande", en: "Note" },
  place_booking: { sv: "Skicka bokning", en: "Place booking" },
  booking_sending: { sv: "Bokar…", en: "Booking…" },
  booking_done: {
    sv: "Tack! Vi har tagit emot din bokningsförfrågan. Den väntar på bekräftelse.",
    en: "Thank you! We have received your booking request. It is pending confirmation.",
  },
  booking_pending_title: {
    sv: "Förfrågan mottagen – väntar på bekräftelse",
    en: "Request received – pending confirmation",
  },
  booking_pending_body: {
    sv: "Utrustningen är inte reserverad förrän vi har bekräftat bokningen. Vi kontrollerar tillgängligheten och återkommer via e-post.",
    en: "The equipment is not reserved until we confirm the booking. We will check availability and get back to you by email.",
  },
  order_number: { sv: "Ordernummer", en: "Order number" },
  track_order: { sv: "Följ din order", en: "Track your order" },
  order_not_found: { sv: "Ordern hittades inte.", en: "Order not found." },
  status: { sv: "Status", en: "Status" },
  delivery_method: { sv: "Leveranssätt", en: "Delivery method" },
  we_confirm: {
    sv: "Det här är en bokningsförfrågan. Utrustningen reserveras först när vi har bekräftat den via e-post.",
    en: "This is a booking request. The equipment is reserved only once we have confirmed it by email.",
  },
};

/** Route paths for the booking flow, per language. */
export const bookingPaths = (lang: Lang) =>
  lang === "sv"
    ? { cart: "/varukorg", checkout: "/kassa", order: "/order" }
    : { cart: "/en/cart", checkout: "/en/checkout", order: "/en/order" };

export const t = (key: keyof typeof DICT | string, lang: Lang) => DICT[key]?.[lang] ?? String(key);

export const NAV = (lang: Lang) => {
  const catalog = pageOf("catalog");
  const kits = pageOf("kits");
  const about = findPage("info", "about")!;
  const contact = findPage("info", "contact")!;
  return [
    { label: lang === "sv" ? "Utrustning" : "Equipment", href: catalog.path[lang] },
    { label: lang === "sv" ? "Paket" : "Kits & Bundles", href: kits.path[lang] },
    { label: lang === "sv" ? "Om oss" : "About", href: about.path[lang] },
    { label: lang === "sv" ? "Kontakt" : "Contact", href: contact.path[lang] },
  ];
};

export const COMPANY = {
  name: "Renthub.se",
  legal: "Dream Crazy Big AB",
  address: "Nikolaigatan 10, 702 10 Örebro",
  email: "contact@avrental.se",
  phone: "073-511 90 05",
};
