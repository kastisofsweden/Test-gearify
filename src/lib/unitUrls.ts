/** Published site, used when no explicit base URL is configured and there is no browser origin (SSR). */
export const PUBLISHED_SITE_URL = "https://renthub.se";

/** QR settings row (app_settings) fields used here. */
export type QrSettings = {
  qr_base_url: string | null;
  qr_legacy_domains: string[] | null;
};

/** "HTTPS://Qr.Renthub.se/" -> "https://qr.renthub.se"; null for anything that isn't a bare https origin. */
export function normalizeBaseUrl(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return url.origin.toLowerCase();
}

/**
 * Base for NEW QR codes. Order: the back-office setting (app_settings.qr_base_url), else
 * VITE_PUBLIC_SITE_URL, else the current browser origin, else the published site.
 */
export function resolveQrBaseUrl(
  settings: Pick<QrSettings, "qr_base_url"> | null | undefined,
  env: string | null | undefined,
  origin: string | null | undefined,
): string {
  return (
    normalizeBaseUrl(settings?.qr_base_url) ??
    normalizeBaseUrl(env) ??
    normalizeBaseUrl(origin) ??
    PUBLISHED_SITE_URL
  );
}

/** True when `host` (e.g. "old.example.se") is one of the legacy QR domains. */
export function isLegacyHost(host: string, settings: QrSettings | null | undefined): boolean {
  const h = host.trim().toLowerCase();
  return (settings?.qr_legacy_domains ?? []).some((d) => {
    const n = normalizeBaseUrl(d);
    return n !== null && new URL(n).host === h;
  });
}

/** Base URL without the DB setting (env, then origin, then published site). */
export function publicSiteBaseUrl(): string {
  return resolveQrBaseUrl(
    null,
    import.meta.env["VITE_PUBLIC_SITE_URL"] as string | undefined,
    typeof window !== "undefined" ? window.location.origin : null,
  );
}

/** Public unit page for a QR token: <base>/i/<token>. Pass the resolved base when printing. */
export function unitPublicUrl(token: string, base: string = publicSiteBaseUrl()): string {
  return `${base.replace(/\/+$/, "")}/i/${token}`;
}
