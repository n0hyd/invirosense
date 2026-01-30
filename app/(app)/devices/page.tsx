// app/(app)/devices/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import DeviceCard from "@/components/DeviceCard";
import { createClient } from "@/lib/supabase/server";

// ---------- Types matching your schema ----------
type Device = {
  id: string;
  name: string;
  status: string | null;
  temp_min: number | null; // °C
  temp_max: number | null; // °C
  rh_min: number | null;   // %
  rh_max: number | null;   // %
  report_interval_min: number | null;
  sample_interval_min: number | null;
};

type CurrentReading = {
  device_id: string;
  ts: string;              // ISO
  temp_c: number | null;
  rh: number | null;
};

type HourlyReading = {
  device_id: string;
  hour_bucket: string;     // ISO
  avg_temp_c: number | null;
  avg_rh: number | null;
};

// ---------- Helpers ----------
function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const DEFAULT_EXPECTED_INTERVAL_MIN = 15;

export default async function DevicesPage({
  // Next 15 dynamic route quirk: searchParams is async
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const sp = await searchParams;
  const unitParam = asString(sp?.unit);
  const unit: "F" | "C" = unitParam === "C" ? "C" : "F";

  const supabase = await createClient();
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("orgId")?.value ?? null;

  // 1) Devices (RLS scopes to viewer's orgs)
  let devicesQuery = supabase
    .from("devices")
    .select("id,name,status,temp_min,temp_max,rh_min,rh_max,report_interval_min,sample_interval_min")
    .order("name", { ascending: true });

  if (activeOrgId) {
    devicesQuery = devicesQuery.eq("organization_id", activeOrgId);
  }

  const { data: devicesData, error: devicesErr } = await devicesQuery;

  if (devicesErr) {
    return (
      <div className="mx-auto max-w-7xl p-4">
        <h1 className="text-3xl font-bold tracking-tight">Devices</h1>
        <p className="mt-2 text-sm text-red-600">
          Failed to load devices: {devicesErr.message}
        </p>
      </div>
    );
  }

  const devices: Device[] = (devicesData ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    status: d.status,
    temp_min: num(d.temp_min),
    temp_max: num(d.temp_max),
    rh_min: num(d.rh_min),
    rh_max: num(d.rh_max),
    report_interval_min: num(d.report_interval_min),
    sample_interval_min: num(d.sample_interval_min),
  }));

  if (devices.length === 0) {
    return (
      <div className="mx-auto max-w-7xl p-4">
        <h1 className="text-3xl font-bold tracking-tight">Devices</h1>
        <p className="mt-2 text-sm text-zinc-600">
          No devices found. Add a device or check your organization access.
        </p>
      </div>
    );
  }

  const deviceIds = devices.map((d) => d.id);

  // ---------- 2) Latest readings within the last 24 hours ----------
  const now = Date.now();
  const since24hISO = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentRows, error: recentErr } = await supabase
    .from("sensor_readings")
    .select("device_id, ts, temp_c, rh")
    .in("device_id", deviceIds)
    .gte("ts", since24hISO)
    .order("ts", { ascending: false });

  // Reduce to latest row per device (within 24h)
  const latest24hByDevice = new Map<string, CurrentReading>();
  if (!recentErr && recentRows) {
    for (const r of recentRows as CurrentReading[]) {
      if (!latest24hByDevice.has(r.device_id)) {
        latest24hByDevice.set(r.device_id, {
          device_id: r.device_id,
          ts: r.ts,
          temp_c: num(r.temp_c),
          rh: num(r.rh),
        });
      }
    }
  }

  // ---------- 3) For devices missing a 24h reading, fall back to latest-ever ----------
  const missingIds = deviceIds.filter((id) => !latest24hByDevice.has(id));

  let latestEverByDevice = new Map<string, CurrentReading>();
  if (missingIds.length > 0) {
    // Pull a reasonably large window of latest rows and reduce.
    // (If datasets are very large, consider a SQL view using DISTINCT ON.)
    const { data: allRows } = await supabase
      .from("sensor_readings")
      .select("device_id, ts, temp_c, rh")
      .in("device_id", missingIds)
      .order("ts", { ascending: false })
      .limit(2000); // safety cap; adjust as needed

    if (allRows) {
      latestEverByDevice = new Map<string, CurrentReading>();
      for (const r of allRows as CurrentReading[]) {
        if (!latestEverByDevice.has(r.device_id)) {
          latestEverByDevice.set(r.device_id, {
            device_id: r.device_id,
            ts: r.ts,
            temp_c: num(r.temp_c),
            rh: num(r.rh),
          });
        }
      }
    }
  }

  // ---------- 4) 24h highs/lows from hourly table ----------
  const { data: hourlyRows, error: hourlyErr } = await supabase
    .from("sensor_readings_hourly")
    .select("device_id, hour_bucket, avg_temp_c, avg_rh")
    .in("device_id", deviceIds)
    .gte("hour_bucket", since24hISO)
    .order("hour_bucket", { ascending: false });

  const statsByDevice = new Map<
    string,
    { highTempC: number | null; lowTempC: number | null; highRH: number | null; lowRH: number | null }
  >();

  if (!hourlyErr && hourlyRows) {
    for (const row of hourlyRows as HourlyReading[]) {
      const id = row.device_id;
      const cur = statsByDevice.get(id) ?? {
        highTempC: null,
        lowTempC: null,
        highRH: null,
        lowRH: null,
      };
      const t = num(row.avg_temp_c);
      const h = num(row.avg_rh);

      if (t != null) {
        cur.highTempC = cur.highTempC == null ? t : Math.max(cur.highTempC, t);
        cur.lowTempC = cur.lowTempC == null ? t : Math.min(cur.lowTempC, t);
      }
      if (h != null) {
        cur.highRH = cur.highRH == null ? h : Math.max(cur.highRH, h);
        cur.lowRH = cur.lowRH == null ? h : Math.min(cur.lowRH, h);
      }
      statsByDevice.set(id, cur);
    }
  }

  // ---------- 5) Build render data; cap Last check-in label at 24h ----------
  const capAt24h = (tsISO: string | null) => {
    if (!tsISO) return null;
    const tsMs = new Date(tsISO).getTime();
    if (!Number.isFinite(tsMs)) return null;
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    // We will pass the real reading values, but we clamp the displayed "at" to now-24h
    // so the DeviceCard shows "24 hours ago" once older than 24h.
    return tsMs < twentyFourHoursAgo ? new Date(twentyFourHoursAgo).toISOString() : tsISO;
  };

  return (
    <div className="mx-auto max-w-7xl p-4">
      {/* Strong, high-contrast heading + subhead */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Devices</h1>
          <p className="mt-1 text-base font-medium text-zinc-700">
            Live status and latest readings
          </p>
        </div>
        <Link
          href={activeOrgId ? `/orgs/${activeOrgId}` : "/orgs"}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
        >
          Add device
        </Link>
      </div>

      {/* Unit toggle (server links preserve ?unit) */}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-sm text-zinc-600">Units:</span>
        <div className="inline-flex rounded-lg border border-zinc-200 overflow-hidden">
          <Link
            href={`/devices?unit=F`}
            className={`px-3 py-1 text-sm ${
              unit === "F" ? "bg-zinc-900 text-white" : "bg-white text-zinc-700"
            }`}
          >
            °F
          </Link>
          <Link
            href={`/devices?unit=C`}
            className={`px-3 py-1 text-sm ${
              unit === "C" ? "bg-zinc-900 text-white" : "bg-white text-zinc-700"
            }`}
          >
            °C
          </Link>
        </div>
      </div>

      {/* Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {devices.map((d) => {
          // Prefer the latest within 24h; otherwise fallback to latest-ever
          const r24 = latest24hByDevice.get(d.id);
          const rAny = r24 ?? latestEverByDevice.get(d.id) ?? null;

          const tsDisplay = capAt24h(rAny?.ts ?? null);

          return (
            <DeviceCard
              key={d.id}
              device={d}
              current={{
                tempC: rAny ? num(rAny.temp_c) : null,
                rh: rAny ? num(rAny.rh) : null,
                at: tsDisplay, // clamp to 24h for the "Last check-in" label
              }}
              stats24h={{
                highTempC: statsByDevice.get(d.id)?.highTempC ?? null,
                lowTempC: statsByDevice.get(d.id)?.lowTempC ?? null,
                highRH: statsByDevice.get(d.id)?.highRH ?? null,
                lowRH: statsByDevice.get(d.id)?.lowRH ?? null,
              }}
              unit={unit}
              href={`/device/${d.id}?unit=${unit}`}
              expectedIntervalMin={d.sample_interval_min ?? d.report_interval_min ?? DEFAULT_EXPECTED_INTERVAL_MIN}
            />
          );
        })}
      </div>
    </div>
  );
}
