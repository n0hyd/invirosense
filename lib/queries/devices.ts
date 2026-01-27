// lib/queries/devices.ts
import type { SupabaseClient } from "@supabase/supabase-js";

// ---- Types you can reuse in components ----
export type LatestReading = {
  ts: string | null;
  temp_c: number | null;
  rh: number | null;
};

export type DeviceRow = {
  id: string;
  organization_id: string;
  name: string;
  ingest_key?: string | null;
  last_seen?: string | null;
  status?: string | null;
  temp_min?: number | null;
  temp_max?: number | null;
  rh_min?: number | null;
  rh_max?: number | null;
  firmware_version?: string | null;
  model?: string | null;
  channel?: string | null;
  created_at?: string | null;
};

export type NormalizedDevice = DeviceRow & {
  // normalized + computed
  status: string; // ok | alert | offline | <whatever in DB>
  latest_reading: LatestReading | null;
};

// ---- Helpers ----
const toNum = (v: any): number | null => (v === null || v === undefined ? null : Number(v));
const minutesAgo = (iso: string | null | undefined) =>
  !iso ? Infinity : (Date.now() - new Date(iso).getTime()) / 60000;

function computeStatus(
  baseStatus: string | null | undefined,
  last_seen: string | null | undefined,
  latest: LatestReading | null,
  ranges: { tmin: number | null; tmax: number | null; rmin: number | null; rmax: number | null }
) {
  // If DB already provided a status, respect it.
  if (baseStatus && baseStatus.trim()) return baseStatus;

  // Offline if we haven't seen the device in 10+ minutes.
  if (minutesAgo(last_seen) > 10) return "offline";

  // If no reading yet, treat as offline-ish (or "ok" if you prefer).
  if (!latest || (latest.temp_c == null && latest.rh == null)) return "offline";

  const { tmin, tmax, rmin, rmax } = ranges;
  const tempBad =
    latest.temp_c != null &&
    ((tmin != null && latest.temp_c < tmin) || (tmax != null && latest.temp_c > tmax));
  const rhBad =
    latest.rh != null && ((rmin != null && latest.rh < rmin) || (rmax != null && latest.rh > rmax));

  return tempBad || rhBad ? "alert" : "ok";
}

// ---- Main query ----
export async function getDevicesWithLatest(supabase: SupabaseClient): Promise<NormalizedDevice[]> {
  // Pull devices + limit the related sensor_readings to the single newest row
  const { data, error } = await supabase
    .from("devices")
    .select(
      `
      id, organization_id, name, ingest_key, last_seen, status,
      temp_min, temp_max, rh_min, rh_max,
      firmware_version, model, channel, created_at,
      sensor_readings: sensor_readings ( ts, temp_c, rh )
    `
    )
    .order("name", { ascending: true })
    .order("ts", { foreignTable: "sensor_readings", ascending: false })
    .limit(1, { foreignTable: "sensor_readings" });

  if (error) throw error;

  // Normalize shape, cast numerics, compute status
  return (data ?? []).map((d: any) => {
    const r = Array.isArray(d.sensor_readings) ? d.sensor_readings[0] : null;

    const latest: LatestReading | null = r
      ? {
          ts: r.ts ?? null,
          temp_c: toNum(r.temp_c),
          rh: toNum(r.rh),
        }
      : null;

    const normalized: NormalizedDevice = {
      id: d.id,
      organization_id: d.organization_id,
      name: d.name,
      ingest_key: d.ingest_key ?? null,
      last_seen: d.last_seen ?? null,
      // thresholds as numbers (Postgres numeric often returns strings)
      temp_min: toNum(d.temp_min),
      temp_max: toNum(d.temp_max),
      rh_min: toNum(d.rh_min),
      rh_max: toNum(d.rh_max),
      firmware_version: d.firmware_version ?? null,
      model: d.model ?? null,
      channel: d.channel ?? null,
      created_at: d.created_at ?? null,

      latest_reading: latest,

      // If DB didn't set status, compute a sensible default
      status: computeStatus(d.status, d.last_seen, latest, {
        tmin: toNum(d.temp_min),
        tmax: toNum(d.temp_max),
        rmin: toNum(d.rh_min),
        rmax: toNum(d.rh_max),
      }),
    };

    return normalized;
  });
}
