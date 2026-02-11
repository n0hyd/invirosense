import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const orgId = body.orgId as string | undefined;
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!orgId || !email) {
    return NextResponse.json({ error: "orgId and email required" }, { status: 400 });
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

  const admin = createAdminClient();
  const { data: inviteRow, error: inviteErr } = await admin
    .from("org_invites")
    .select("role,status")
    .eq("organization_id", orgId)
    .eq("email", email)
    .maybeSingle();

  if (inviteErr || !inviteRow) {
    return NextResponse.json({ error: "invite not found" }, { status: 404 });
  }
  if (inviteRow.status !== "pending") {
    return NextResponse.json({ error: "invite is not pending" }, { status: 400 });
  }

  const origin = (await headers()).get("origin") ?? "";
  const redirectTo = origin ? `${origin}/auth/callback?next=/orgs/${orgId}` : undefined;

  const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (sendErr) {
    return NextResponse.json({ error: sendErr.message }, { status: 500 });
  }

  const { error: updateErr } = await admin
    .from("org_invites")
    .update({ last_sent_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("email", email);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const orgId = body.orgId as string | undefined;
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!orgId || !email) {
    return NextResponse.json({ error: "orgId and email required" }, { status: 400 });
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

  const admin = createAdminClient();
  const { error: updateErr } = await admin
    .from("org_invites")
    .update({ status: "revoked" })
    .eq("organization_id", orgId)
    .eq("email", email)
    .eq("status", "pending");

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
