/**
 * Owner-only diagnostic endpoint to check which env vars the running SSR
 * server can actually see. Never echoes secret values — only presence +
 * length + first/last 3 chars so you can verify it matches what you set
 * without leaking the full key in browser history or logs.
 *
 * Hit:  /api/_debug/env
 * Returns 403 if not signed in as an owner.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function mask(v: string | undefined | null): {
  present: boolean;
  length: number;
  preview: string | null;
} {
  if (!v) return { present: false, length: 0, preview: null };
  const len = v.length;
  if (len <= 8) return { present: true, length: len, preview: "***" };
  return {
    present: true,
    length: len,
    preview: `${v.slice(0, 3)}…${v.slice(-3)}`,
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: role } = await supabase.rpc("get_user_role");
  if (role !== "owner") {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  return NextResponse.json({
    runtime: {
      node_version: process.version,
      vercel: !!process.env.VERCEL,
      azure_swa_env: process.env.AZURE_STATIC_WEB_APPS_ENVIRONMENT ?? null,
    },
    env: {
      NEXT_PUBLIC_SUPABASE_URL: mask(process.env.NEXT_PUBLIC_SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: mask(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      SUPABASE_SERVICE_ROLE_KEY: mask(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
  });
}
