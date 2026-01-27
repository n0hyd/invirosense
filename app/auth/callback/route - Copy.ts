import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const supabase = await createClient();

  if (!code) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  }

  // Redirect to a separate page so there's no conflict
  return NextResponse.redirect(new URL("/auth/callback/done", request.url));
}
