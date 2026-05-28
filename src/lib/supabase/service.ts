/**
 * Service-role Supabase client. Server-only.
 *
 * Use this ONLY for operations that genuinely need to bypass RLS — e.g.
 * inviting auth users, looking up emails for tenant member lists,
 * admin-level user management.
 *
 * Every caller must do its own permission check (see `requireOwner` in
 * lib/permissions.ts) before using this client, because RLS is off.
 *
 * Reads `SUPABASE_SERVICE_ROLE_KEY` from the environment. Copy it from
 *   Supabase dashboard → Project Settings → API → service_role
 * and add to `.env.local` for local dev + your Azure SWA env vars for prod.
 */

import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local and your Azure env vars."
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
