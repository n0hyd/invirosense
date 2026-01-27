// app/auth/signout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function toLogin(url: string) {
  return NextResponse.redirect(new URL("/login", url));
}

// Prefer POST for CSRF safety; include GET for quick manual testing/link clicks.
export async function POST(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut(); // clears the server cookies
  return toLogin(req.url);
}

export async function GET(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return toLogin(req.url);
}
