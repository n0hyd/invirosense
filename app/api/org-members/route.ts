import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ROLE_SET = new Set(["owner", "admin", "editor", "viewer"]);

async function requireOwnerOrAdmin(orgId: string) {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { supabase, error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: member, error: memberErr } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (memberErr || !member) {
    return { supabase, error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  if (member.role !== "owner" && member.role !== "admin") {
    return { supabase, error: NextResponse.json({ error: "owner/admin only" }, { status: 403 }) };
  }

  return { supabase, error: null };
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const orgId = body.orgId as string | undefined;
  const userId = body.userId as string | undefined;
  const role = String(body.role ?? "");

  if (!orgId || !userId) {
    return NextResponse.json({ error: "orgId and userId required" }, { status: 400 });
  }
  if (!ROLE_SET.has(role)) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }

  const { supabase, error } = await requireOwnerOrAdmin(orgId);
  if (error) return error;

  const { error: updateErr } = await supabase
    .from("memberships")
    .update({ role })
    .eq("organization_id", orgId)
    .eq("user_id", userId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const orgId = body.orgId as string | undefined;
  const userId = body.userId as string | undefined;

  if (!orgId || !userId) {
    return NextResponse.json({ error: "orgId and userId required" }, { status: 400 });
  }

  const { supabase, error } = await requireOwnerOrAdmin(orgId);
  if (error) return error;

  const { error: deleteErr } = await supabase
    .from("memberships")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", userId);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
