import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const orgId = body.orgId as string | undefined;
  const name = String(body.name ?? "").trim();

  if (!orgId || !name) {
    return NextResponse.json({ error: "orgId and name required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error: updateErr } = await supabase
    .from("organizations")
    .update({ name })
    .eq("id", orgId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
