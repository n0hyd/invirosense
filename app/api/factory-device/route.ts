import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const deviceId = String(body.device_id ?? "").trim();
  const name = String(body.name ?? "").trim();

  if (!deviceId || !isUuid(deviceId)) {
    return NextResponse.json({ error: "valid device_id required" }, { status: 400 });
  }

  const factoryOrgId = process.env.FACTORY_ORG_ID;
  if (!factoryOrgId) {
    return NextResponse.json({ error: "FACTORY_ORG_ID not configured" }, { status: 500 });
  }

  const supabase = createAdminClient();

  const { data: existing, error: existingErr } = await supabase
    .from("devices")
    .select("id, organization_id")
    .eq("id", deviceId)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ ok: true, device_id: existing.id, existing: true }, { status: 200 });
  }

  const displayName = name || `Unclaimed ${deviceId.slice(0, 8)}`;
  const { error: insertErr } = await supabase.from("devices").insert({
    id: deviceId,
    organization_id: factoryOrgId,
    name: displayName,
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, device_id: deviceId, existing: false }, { status: 200 });
}
