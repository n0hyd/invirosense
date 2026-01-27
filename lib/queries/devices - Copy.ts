// lib/queries/devices.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type Reading = {
  ts: string;          // timestamptz
  temp_c: number | null;
  rh: number | null;
};

export type DeviceRow = {
  id: string;                  // uuid
  organization_id: string;     // uuid
  name: string;                // text
  ingest_key: string | null;   // text
  last_seen: string | null;    // timestamptz
  status: string | null;       // text
  temp_min: number | null;     // numeric
  temp_max: number | null;     // numeric
  rh_min: number | null;       // numeric
  rh_max: number | null;       // numeric
  firmware_version: string | null;
  model: string | null;
  channel: string | null;
  created_at: string;          // timestamptz
  sensor_readings?: Reading[]; // related rows
};

export async function getDevicesWithLatest(
  supabase: SupabaseClient,
  opts?: { orgId?: string }
): Promise<DeviceRow[]> {
  // Pull the device columns you actually have + related readings
  let q = supabase
    .from("devices")
    .select(
      `
      id,
      organization_id,
      name,
      ingest_key,
      last_seen,
      status,
      temp_min, temp_max,
      rh_min, rh_max,
      firmware_version,
      model,
      channel,
      created_at,
      sensor_readings (
        ts,
        temp_c,
        rh
      )
    `
    );

  if (opts?.orgId) q = q.eq("organization_id", opts.orgId);

  const { data, error } = await q;

  if (error) {
    console.error("getDevicesWithLatest error:", {
      message: (error as any)?.message,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
      code: (error as any)?.code,
    });
    return [];
  }

  // Sort readings newest-first so [0] is the latest
  const devices = (data ?? []) as DeviceRow[];
  for (const d of devices) {
    if (Array.isArray(d.sensor_readings)) {
      d.sensor_readings.sort(
        (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
      );
    } else {
      d.sensor_readings = [];
    }
  }

  return devices;
}
