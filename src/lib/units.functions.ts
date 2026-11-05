import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PublicUnit = {
  unit_number: string;
  /** Primary S/N printed on the label (e.g. DCB001-TV001). */
  serial_code: string | null;
  name: string;
  image_url: string | null;
  description: string | null;
  page_type: string | null;
  page_slug: string | null;
  is_retired: boolean;
};

const inputSchema = z.object({ token: z.string().max(200) });
const tokenPattern = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Public QR landing lookup. Runs with the publishable key (anon role), so the
 * only data available is what get_public_unit deliberately exposes.
 */
export const getPublicUnit = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<PublicUnit | null> => {
    const token = data.token.trim();
    if (!tokenPattern.test(token)) return null;

    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
    if (!url || !key) throw new Error("Backend is not configured");

    const { createClient } = await import("@supabase/supabase-js");
    const isOpaqueKey = key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
    const client = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (isOpaqueKey && headers.get("Authorization") === `Bearer ${key}`)
            headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const { data: unit, error } = await client.rpc("get_public_unit", { _token: token });
    if (error) throw new Error(error.message);
    return (unit as PublicUnit | null) ?? null;
  });
