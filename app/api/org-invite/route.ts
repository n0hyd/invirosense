import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_ROLES = new Set(["viewer", "editor", "admin"]);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const orgId = body.orgId as string | undefined;
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = String(body.role ?? "viewer");
  const name = String(body.name ?? "").trim();

  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
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
  const origin = (await headers()).get("origin") ?? "";
  const redirectTo = origin ? `${origin}/auth/callback?next=/orgs/${orgId}` : undefined;

  const inviteDataPayload = {
    redirectTo,
    data: {
      organization_id: orgId,
      ...(name ? { display_name: name } : {}),
    },
  };

  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    email,
    inviteDataPayload
  );

  if (inviteErr || !inviteData?.user?.id) {
    return NextResponse.json({ error: inviteErr?.message || "invite failed" }, { status: 500 });
  }

  const { error: insertErr } = await admin.from("memberships").upsert(
    {
      user_id: inviteData.user.id,
      organization_id: orgId,
      role,
    },
    { onConflict: "user_id,organization_id" }
  );

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const { error: inviteRowErr } = await admin.from("org_invites").upsert(
    {
      organization_id: orgId,
      email,
      role,
      invited_by: userData.user.id,
      status: "pending",
      last_sent_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,email" }
  );
  if (inviteRowErr) {
    return NextResponse.json({ error: inviteRowErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
