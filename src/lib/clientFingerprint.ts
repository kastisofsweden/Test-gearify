import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Visitor IP from Cloudflare only. x-real-ip / x-forwarded-for are client-controlled
 * and are never read. Missing header -> shared "unknown" bucket (still rate limited).
 */
function clientIp(scope: string): string {
  const ip = getRequestHeader("cf-connecting-ip")?.trim();
  if (ip) return ip;
  console.warn(`${scope}: cf-connecting-ip missing; using unknown fingerprint bucket`);
  return "unknown";
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Salted SHA-256 of the visitor IP, for server-side rate limiting only.
 * Server-function handlers only. Fails closed when the salt secret is missing.
 */
export async function clientFingerprint(scope: string): Promise<string> {
  const salt = process.env["BOOKING_FINGERPRINT_SALT"] ?? "";
  if (!salt) throw new Error("booking_unavailable");
  return sha256Hex(`${salt}:${clientIp(scope)}`);
}
