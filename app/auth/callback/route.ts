// app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const { data: userData } = await supabase.auth.getUser();
  const email = userData?.user?.email ?? null;
  if (email && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    await admin
      .from("org_invites")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("email", email)
      .eq("status", "pending");
  }

  return NextResponse.redirect(new URL(next, url.origin).toString());
}
