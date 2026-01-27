// app/(app)/device/[id]/DevicePage.tsx — drop-in with frequency badge + persisted interval + safe onChange
"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
} from "recharts";
import { Thermometer, Droplet, WifiOff, Timer } from "lucide-react";
import clsx from "clsx";

// ---------- Types ----------
export type Device = {
  id: string;
  name: string;
  status: string | null;
  last_seen: string | null;
  temp_min: number | null; // °C in DB
  temp_max: number | null; // °C in DB
  rh_min: number | null;   // %
  rh_max: number | null;   // %
  model: string | null;
  channel: string | null;
  firmware_version: string | null;
  // deep-sleep wake/send interval (minutes), optional in prop – we re-fetch it on mount
  sample_interval_min?: number | null;
};

type Reading = {
  ts: string;             // ISO
  temp_c: number | null;  // °C
  rh: number | null;      // %
};

type DeviceStatus = "online" | "offline" | "alert";

// ---------- Helpers ----------
const cToF = (c: number) => (c * 9) / 5 + 32;
const fToC = (f: number) => ((f - 32) * 5) / 9;

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function fmtTemp(c: number | null, unit: "C" | "F" = "F") {
  if (!isFiniteNum(c)) return "—";
  const val = unit === "F" ? cToF(c) : c;
  const num = val.toFixed(1);
  return num + (unit === "F" ? "°F" : "°C");
}

function fmtRH(rh: number | null) {
  if (!isFiniteNum(rh)) return "—";
  return String(Math.round(rh)) + "%";
}

const fmtTS = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

// ---------- UI bits ----------
function StatusPill({ status }: { status: DeviceStatus }) {
  const color =
    status === "alert"
      ? "bg-red-600/15 text-red-700 ring-red-600/30"
      : status === "offline"
      ? "bg-zinc-500/15 text-zinc-700 ring-zinc-600/30"
      : "bg-emerald-600/15 text-emerald-700 ring-emerald-600/30";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ring-1",
        color
      )}
      aria-label={`Device status: ${label}`}
    >
      <span className="h-2 w-2 rounded-full bg-current/70" />
      {label}
    </span>
  );
}

function SmallBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
      {children}
    </span>
  );
}

// ---------- Small input helper ----------
function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
  placeholder,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={step}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => {
            const t = e.currentTarget.value.trim();
            onChange(t === "" ? null : Number(t));
          }}
        />
        {suffix ? <span className="text-sm text-zinc-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

// ---------- Threshold + Frequency Editors ----------
function ThresholdAndFrequency({
  deviceId,
  unit,
  onIntervalChanged,
}: {
  deviceId: string;
  unit: "F" | "C";
  onIntervalChanged?: (min: number) => void;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<"temp" | "rh" | "freq" | null>(null);
  const [state, setState] = React.useState<{
    temp_min: number | null;
    temp_max: number | null;
    rh_min: number | null;
    rh_max: number | null;
    sample_interval_min: number | null;
  }>({
    temp_min: null,
    temp_max: null,
    rh_min: null,
    rh_max: null,
    sample_interval_min: 15,
  });
  const [toast, setToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("devices")
        .select("temp_min,temp_max,rh_min,rh_max,sample_interval_min")
        .eq("id", deviceId)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        setToast(`Failed to load settings: ${error.message}`);
      } else if (data) {
        setState({
          temp_min: (data as any).temp_min ?? null,
          temp_max: (data as any).temp_max ?? null,
          rh_min: (data as any).rh_min ?? null,
          rh_max: (data as any).rh_max ?? null,
          sample_interval_min: (data as any).sample_interval_min ?? 15,
        });
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [deviceId, supabase]);

  // Convert display <-> DB (DB in °C)
  const viewTemp = (c: number | null) =>
    c == null ? null : unit === "F" ? Math.round(cToF(c) * 10) / 10 : Math.round(c * 10) / 10;
  const parseTempToC = (v: number | null) =>
    v == null ? null : unit === "F" ? fToC(v) : v;

  const saveTemp = async () => {
    setSaving("temp");
    const payload = {
      temp_min: parseTempToC(state.temp_min),
      temp_max: parseTempToC(state.temp_max),
    };
    const { error } = await supabase.from("devices").update(payload).eq("id", deviceId);
    setSaving(null);
    setToast(error ? `Save failed: ${error.message}` : "Temperature thresholds saved.");
  };

  const saveRh = async () => {
    setSaving("rh");
    const payload = { rh_min: state.rh_min, rh_max: state.rh_max };
    const { error } = await supabase.from("devices").update(payload).eq("id", deviceId);
    setSaving(null);
    setToast(error ? `Save failed: ${error.message}` : "Humidity thresholds saved.");
  };

  const clampToStep = (raw: number) => {
    const clamped = Math.min(120, Math.max(5, Math.round(raw)));
    return clamped - (clamped % 5);
  };

  const saveFreq = async () => {
    setSaving("freq");
    const minutes = clampToStep(state.sample_interval_min ?? 15);
    const { error } = await supabase
      .from("devices")
      .update({ sample_interval_min: minutes })
      .eq("id", deviceId);
    setSaving(null);
    if (error) {
      setToast(`Save failed: ${error.message}`);
    } else {
      setToast("Sensor frequency saved.");
      onIntervalChanged?.(minutes);
    }
  };

  const freqOptions = React.useMemo(
    () => Array.from({ length: 24 }, (_, i) => (i + 1) * 5), // 5..120 step 5
    []
  );

  const onFreqChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = Number(e.target.value); // read synchronously to avoid pooled event nulls
    setState((s) => ({ ...s, sample_interval_min: val }));
  };

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* Temperature */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900">Set Temperature Thresholds</h3>
          <span className="text-xs text-zinc-500">
            Current: {viewTemp(state.temp_min) ?? "—"}°{unit} – {viewTemp(state.temp_max) ?? "—"}°
            {unit}
          </span>
        </div>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label={`Low (°${unit})`}
              value={viewTemp(state.temp_min)}
              onChange={(v) => setState((s) => ({ ...s, temp_min: parseTempToC(v) }))}
              step={0.1}
              placeholder={`e.g. ${unit === "F" ? "65" : "18.3"}`}
            />
            <NumberField
              label={`High (°${unit})`}
              value={viewTemp(state.temp_max)}
              onChange={(v) => setState((s) => ({ ...s, temp_max: parseTempToC(v) }))}
              step={0.1}
              placeholder={`e.g. ${unit === "F" ? "78" : "25.6"}`}
            />
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button
            onClick={saveTemp}
            disabled={saving === "temp"}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving === "temp" ? "Saving…" : "Save Temperature"}
          </button>
        </div>
      </div>

      {/* Humidity */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900">Set Humidity Thresholds</h3>
          <span className="text-xs text-zinc-500">
            Current: {state.rh_min ?? "—"}% – {state.rh_max ?? "—"}%
          </span>
        </div>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Low (%)"
              value={state.rh_min}
              onChange={(v) => setState((s) => ({ ...s, rh_min: v }))}
              step={1}
              placeholder="e.g. 30"
              suffix="%"
            />
            <NumberField
              label="High (%)"
              value={state.rh_max}
              onChange={(v) => setState((s) => ({ ...s, rh_max: v }))}
              step={1}
              placeholder="e.g. 60"
              suffix="%"
            />
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button
            onClick={saveRh}
            disabled={saving === "rh"}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving === "rh" ? "Saving…" : "Save Humidity"}
          </button>
        </div>
      </div>

      {/* Sensor Frequency */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 text-base font-semibold text-zinc-900">
            <Timer className="h-4 w-4 text-zinc-500" />
            Sensor Frequency
          </h3>
          <span className="text-xs text-zinc-500">
            Current: every {state.sample_interval_min ?? 15} min
          </span>
        </div>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700">Wake/Send/Sleep interval</span>
            <select
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={state.sample_interval_min ?? 15}
              onChange={onFreqChange}
            >
              {freqOptions.map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              Device wakes, takes readings, sends data, then returns to deep sleep.
            </p>
          </label>
        )}
        <div className="mt-4 flex justify-end">
          <button
            onClick={saveFreq}
            disabled={saving === "freq"}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving === "freq" ? "Saving…" : "Save Frequency"}
          </button>
        </div>
      </div>

      {toast && (
        <div className="col-span-full rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------- Main Page ----------
export default function DevicePage({
  device,
  unit: unitProp = "F",
  expectedIntervalMin: _expectedIntervalMin = 15, // unused now; we rely on live-fetched interval
}: {
  device: Device;
  unit?: "F" | "C";
  expectedIntervalMin?: number;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [readings, setReadings] = React.useState<Reading[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [unit, setUnit] = React.useState<"F" | "C">(unitProp);

  // Live interval value (used for badge + offline logic)
  const [intervalMin, setIntervalMin] = React.useState<number>(
    isFiniteNum(device.sample_interval_min) ? (device.sample_interval_min as number) : 15
  );

  // On mount, fetch the persisted sample_interval_min so refreshes reflect DB
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("sample_interval_min")
        .eq("id", device.id)
        .maybeSingle();
      if (!alive) return;
      if (!error && data && typeof data.sample_interval_min === "number") {
        setIntervalMin(data.sample_interval_min);
      }
    })();
    return () => {
      alive = false;
    };
  }, [device.id, supabase]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("sensor_readings")
        .select("ts,temp_c,rh")
        .eq("device_id", device.id)
        .gte("ts", since)
        .order("ts", { ascending: false })
        .limit(500);

      if (!cancelled && recent && recent.length) {
        setReadings(recent as Reading[]);
        setLoading(false);
        return;
      }

      const { data: any500 } = await supabase
        .from("sensor_readings")
        .select("ts,temp_c,rh")
        .eq("device_id", device.id)
        .order("ts", { ascending: false })
        .limit(500);

      if (!cancelled) {
        setReadings((any500 || []) as Reading[]);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [device.id, supabase]);

  const current = readings[0];
  const tempC = current?.temp_c ?? null;
  const rh = current?.rh ?? null;

  const last24 = React.useMemo(() => {
    if (!readings.length)
      return { tMin: null, tMax: null, hMin: null, hMax: null };
    let tMin: number | null = null,
      tMax: number | null = null,
      hMin: number | null = null,
      hMax: number | null = null;
    for (const r of readings) {
      if (isFiniteNum(r.temp_c)) {
        tMin = tMin === null ? r.temp_c : Math.min(tMin, r.temp_c);
        tMax = tMax === null ? r.temp_c : Math.max(tMax, r.temp_c);
      }
      if (isFiniteNum(r.rh)) {
        hMin = hMin === null ? r.rh : Math.min(hMin, r.rh);
        hMax = hMax === null ? r.rh : Math.max(hMax, r.rh);
      }
    }
    return { tMin, tMax, hMin, hMax };
  }, [readings]);

  const chartData = React.useMemo(() => [...readings].reverse(), [readings]);

  // ---- Alerts + Status ----
  // Use live `intervalMin` (persisted) for offline determination
  const now = new Date();
  const lastSeen = device.last_seen ? new Date(device.last_seen) : null;
  const minsSinceSeen = lastSeen
    ? Math.floor((now.getTime() - lastSeen.getTime()) / 60000)
    : Number.POSITIVE_INFINITY;
  const isOffline = minsSinceSeen > intervalMin * 2;

  const tempHighBreach =
    isFiniteNum(tempC) && isFiniteNum(device.temp_max) ? tempC > device.temp_max : false;
  const tempLowBreach =
    isFiniteNum(tempC) && isFiniteNum(device.temp_min) ? tempC < device.temp_min : false;
  const rhHighBreach =
    isFiniteNum(rh) && isFiniteNum(device.rh_max) ? rh > device.rh_max : false;
  const rhLowBreach =
    isFiniteNum(rh) && isFiniteNum(device.rh_min) ? rh < device.rh_min : false;

  const alerts: JSX.Element[] = [];
  if (isOffline) {
    alerts.push(
      <li key="offline" className="flex items-start gap-2 text-red-700">
        <WifiOff className="mt-0.5 h-4 w-4" />
        <span>{fmtTS(device.last_seen)}: Device is offline</span>
      </li>
    );
  }
  if (isFiniteNum(tempC)) {
    if (tempHighBreach) {
      const deltaF = +(cToF(tempC) - cToF(device.temp_max!)).toFixed(1);
      alerts.push(
        <li key="temp-high" className="flex items-start gap-2 text-red-700">
          <Thermometer className="mt-0.5 h-4 w-4" />
          <span>{fmtTS(current?.ts)}: Temp is {deltaF}°F above maximum</span>
        </li>
      );
    }
    if (tempLowBreach) {
      const deltaF = +(cToF(device.temp_min!) - cToF(tempC)).toFixed(1);
      alerts.push(
        <li key="temp-low" className="flex items-start gap-2 text-red-700">
          <Thermometer className="mt-0.5 h-4 w-4" />
          <span>{fmtTS(current?.ts)}: Temp is {deltaF}°F below minimum</span>
        </li>
      );
    }
  }
  if (isFiniteNum(rh)) {
    if (rhHighBreach) {
      const delta = +(rh - device.rh_max!).toFixed(0);
      alerts.push(
        <li key="rh-high" className="flex items-start gap-2 text-red-700">
          <Droplet className="mt-0.5 h-4 w-4" />
          <span>{fmtTS(current?.ts)}: Humidity is {delta}% above maximum</span>
        </li>
      );
    }
    if (rhLowBreach) {
      const delta = +(device.rh_min! - rh).toFixed(0);
      alerts.push(
        <li key="rh-low" className="flex items-start gap-2 text-red-700">
          <Droplet className="mt-0.5 h-4 w-4" />
          <span>{fmtTS(current?.ts)}: Humidity is {delta}% below minimum</span>
        </li>
      );
    }
  }

  const computedStatus: DeviceStatus = isOffline
    ? "offline"
    : alerts.length > 0
    ? "alert"
    : "online";

  return (
    <div className="space-y-6">
      {/* Header with status pill + unit toggle + frequency badge */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">{device.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">Live status and latest readings</p>
        </div>
        <div className="flex items-center gap-2">
          <SmallBadge>
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3.5 w-3.5 opacity-70" />
              Every {intervalMin} min
            </span>
          </SmallBadge>
          <button
            className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
            onClick={() => setUnit((u) => (u === "F" ? "C" : "F"))}
            aria-label="Toggle temperature unit"
            title="Toggle °F/°C"
          >
            °{unit}
          </button>
          <StatusPill status={computedStatus} />
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Current */}
        <div className="rounded-2xl bg-white p-4 shadow">
          <h3 className="text-sm font-medium text-zinc-500">Current</h3>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Thermometer className="h-6 w-6 text-zinc-500" />
              <span className="text-3xl font-semibold text-zinc-900">
                {fmtTemp(tempC, unit)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Droplet className="h-6 w-6 text-zinc-500" />
              <span className="text-3xl font-semibold text-zinc-900">
                {fmtRH(rh)}
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">Last heard: {fmtTS(device.last_seen)}</p>
        </div>

        {/* 24h High/Low Combined */}
        <div className="rounded-2xl bg-white p-4 shadow">
          <h3 className="text-sm font-medium text-zinc-500">24h High / Low</h3>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-zinc-500">High</p>
              <p className="text-2xl font-semibold text-zinc-900">{fmtTemp(last24.tMax, unit)}</p>
              <p className="text-2xl font-semibold text-zinc-900">{fmtRH(last24.hMax)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Low</p>
              <p className="text-2xl font-semibold text-zinc-900">{fmtTemp(last24.tMin, unit)}</p>
              <p className="text-2xl font-semibold text-zinc-900">{fmtRH(last24.hMin)}</p>
            </div>
          </div>
        </div>

        {/* Current Alerts */}
        <div className="rounded-2xl bg-white p-4 shadow">
          <h3 className="text-sm font-medium text-zinc-500">Current Alerts</h3>
          <div className="mt-2 text-sm">
            {alerts.length === 0 ? (
              <div className="text-zinc-500">no current alerts</div>
            ) : (
              <ul className="space-y-2">{alerts}</ul>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-2xl bg-white p-4 shadow">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-500">Last 24 hours</h3>
        <div className="flex items-center gap-3 text-xs text-zinc-600">
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-4 rounded bg-red-500" /> Temp
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-4 rounded bg-blue-500" /> Humidity
            </span>
          </div>
        </div>
        <div className="mt-3 h-64 w-full">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              Loading…
            </div>
          ) : readings.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              No readings
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="ts"
                  tickFormatter={(v) =>
                    new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  }
                  minTickGap={32}
                />
                <YAxis yAxisId="temp" domain={["auto", "auto"]} allowDecimals />
                <YAxis yAxisId="rh" orientation="right" domain={[0, 100]} />
                <Tooltip
                  labelFormatter={(v) => new Date(v).toLocaleString()}
                  formatter={(value: any, name: any) => {
                    if (name === "temp_c") return [fmtTemp(Number(value) || null, unit), "Temp"];
                    if (name === "rh") return [fmtRH(Number(value) || null), "RH"];
                    return [value, name];
                  }}
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="temp_c"
                  stroke="#ef4444"
                  dot={false}
                  strokeWidth={2}
                  name="temp_c"
                />
                <Line
                  yAxisId="rh"
                  type="monotone"
                  dataKey="rh"
                  stroke="#3b82f6"
                  dot={false}
                  strokeWidth={2}
                  name="rh"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Editors BELOW the chart */}
      <ThresholdAndFrequency
        deviceId={device.id}
        unit={unit}
        onIntervalChanged={(m) => setIntervalMin(m)}
      />
    </div>
  );
}
