// app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/orgs";

  if (!code) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl.toString());
  }

  const supabase = await createClient(); // ⬅️ important

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "auth");
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl.toString());
  }

  return NextResponse.redirect(new URL(next, url.origin).toString());
}
