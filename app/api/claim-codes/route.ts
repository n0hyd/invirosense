import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import crypto from "crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function clampMinutes(v: number) {
  if (!Number.isFinite(v)) return 15;
  return Math.max(5, Math.min(120, Math.round(v)));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const cookieStore = await cookies();
  const orgId = body.orgId ?? cookieStore.get("orgId")?.value ?? null;
  const expiresInMinutes = clampMinutes(Number(body.expiresInMinutes ?? 15));

  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: member, error: memberErr } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (memberErr || !member) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (member.role !== "owner" && member.role !== "admin") {
    return NextResponse.json({ error: "owner/admin only" }, { status: 403 });
  }

  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

  for (let i = 0; i < 5; i += 1) {
    const code = makeCode(8);
    const { error: insertErr } = await supabase.from("claim_codes").insert({
      code,
      organization_id: orgId,
      expires_at: expiresAt,
    });
    if (!insertErr) {
      return NextResponse.json({ code, expires_at: expiresAt }, { status: 200 });
    }
  }

  return NextResponse.json({ error: "failed to generate claim code" }, { status: 500 });
}
