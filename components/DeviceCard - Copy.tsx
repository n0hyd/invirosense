// components/DeviceCard.tsx — compact, icon-first readings, tighter spacing
"use client";

import * as React from "react";
import clsx from "clsx";
import { Thermometer, Droplet, AlertTriangle, WifiOff, Wifi } from "lucide-react";

// ---- Types ----
export type Device = {
  id: string;
  name: string;
  status: string | null;
  last_seen: string | null; // ISO
  temp_min?: number | null;
  temp_max?: number | null;
  rh_min?: number | null;
  rh_max?: number | null;
  model?: string | null;
  channel?: string | null;
  firmware_version?: string | null;
};

export type CurrentReadings = {
  tempF?: number | null; // already converted to °F by caller
  rh?: number | null;    // % RH
};

export type Stats24h = {
  highTempF?: number | null;
  lowTempF?: number | null;
  highRh?: number | null;
  lowRh?: number | null;
};

export function DeviceCard({
  device,
  current,
  stats24h,
  reportIntervalMin = 15,
  className,
}: {
  device: Device;
  current: CurrentReadings;
  stats24h: Stats24h;
  /** Report interval (minutes). Used only for online/offline heuristic. */
  reportIntervalMin?: number;
  className?: string;
}) {
  const now = React.useMemo(() => new Date(), []);

  // --- Online/offline ---
  const lastSeen = device.last_seen ? new Date(device.last_seen) : null;
  const onlineCutoffMs = (reportIntervalMin * 2) * 60 * 1000; // report_interval * 2
  const isOnline = lastSeen ? (now.getTime() - lastSeen.getTime()) <= onlineCutoffMs : false;

  // --- Alerts (threshold breach) ---
  const temp = nOrNull(current.tempF);
  const rh = nOrNull(current.rh);

  const tMin = nOrNull(device.temp_min);
  const tMax = nOrNull(device.temp_max);
  const rMin = nOrNull(device.rh_min);
  const rMax = nOrNull(device.rh_max);

  const tempAlert = temp != null && ((tMin != null && temp < tMin) || (tMax != null && temp > tMax));
  const rhAlert   = rh   != null && ((rMin != null && rh   < rMin)   || (rMax != null && rh   > rMax));
  const inAlert = tempAlert || rhAlert;

  // --- Deltas for alert display ---
  const tempDelta = tempAlert
    ? (tMin != null && temp < tMin)
      ? { dir: "under", value: +(tMin - temp).toFixed(1) }
      : (tMax != null && temp > tMax)
        ? { dir: "over", value: +(temp - tMax).toFixed(1) }
        : null
    : null;

  const rhDelta = rhAlert
    ? (rMin != null && rh < rMin)
      ? { dir: "under", value: +(rMin - rh).toFixed(0) }
      : (rMax != null && rh > rMax)
        ? { dir: "over", value: +(rh - rMax).toFixed(0) }
        : null
    : null;

  // --- 24h stats formatting ---
  const hiLoTemp = compactHiLo(stats24h.highTempF, stats24h.lowTempF, "°F");
  const hiLoRh   = compactHiLo(stats24h.highRh, stats24h.lowRh, "%");

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md",
        "md:max-w-sm",
        // Equalize heights a bit without hard-coding; ensure room for alert lines
        "flex flex-col",
        className
      )}
    >
      {/* Left alert stripe */}
      <div
        className={clsx(
          "absolute left-0 top-0 h-full w-1",
          inAlert ? "bg-red-500 animate-pulse" : "bg-transparent"
        )}
        aria-hidden
      />

      {/* Card content */}
      <div className="p-4">
        {/* Header row: name + pills */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-zinc-900">{device.name}</h3>
            {/* Tiny last seen */}
            <p className="mt-0.5 text-[10px] leading-tight text-zinc-500">
              {lastSeen ? `last seen ${relativeTime(lastSeen)}` : "never seen"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {inAlert ? (
              <Pill className="bg-red-100 text-red-700 ring-red-200">
                <AlertTriangle className="mr-1 h-3 w-3" /> Alert
              </Pill>
            ) : isOnline ? (
              <Pill className="bg-emerald-100 text-emerald-700 ring-emerald-200">
                <Wifi className="mr-1 h-3 w-3" /> Online
              </Pill>
            ) : (
              <Pill className="bg-zinc-100 text-zinc-700 ring-zinc-200">
                <WifiOff className="mr-1 h-3 w-3" /> Offline
              </Pill>
            )}
          </div>
        </div>

        {/* Current readings — compact with bw icons */}
        <div className="mt-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Thermometer className="h-3.5 w-3.5 text-zinc-700" aria-hidden />
              <span className="text-base font-medium text-zinc-900 tabular-nums">
                {numOrDash(temp)}°F
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Droplet className="h-3.5 w-3.5 text-zinc-700" aria-hidden />
              <span className="text-base font-medium text-zinc-900 tabular-nums">
                {numOrDash(rh)}%
              </span>
            </div>
          </div>
        </div>

        {/* 24h hi/lo — inline, compact */}
        <div className="mt-2 text-xs text-zinc-600">
          <div>
            <span className="font-medium text-zinc-700">24h High:</span>{" "}
            <span className="tabular-nums">{hiLoTemp.high}{hiLoTemp.unit}</span>{" "}
            <span className="mx-1 text-zinc-400">·</span>
            <span className="tabular-nums">{hiLoRh.high}{hiLoRh.unit}</span>
          </div>
          <div>
            <span className="font-medium text-zinc-700">24h Low:</span>{" "}
            <span className="tabular-nums">{hiLoTemp.low}{hiLoTemp.unit}</span>{" "}
            <span className="mx-1 text-zinc-400">·</span>
            <span className="tabular-nums">{hiLoRh.low}{hiLoRh.unit}</span>
          </div>
        </div>

        {/* Thresholds shown only if configured */}
        {(tMin != null || tMax != null || rMin != null || rMax != null) && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-600">
            <div>
              <span className="text-zinc-700">Temp range:</span>{" "}
              {rangeText(tMin, tMax, "°F")}
            </div>
            <div>
              <span className="text-zinc-700">RH range:</span>{" "}
              {rangeText(rMin, rMax, "%")}
            </div>
          </div>
        )}

        {/* Alert deltas */}
        {inAlert && (
          <div className="mt-2 space-y-1 text-xs">
            {tempDelta && (
              <div className="text-red-700">
                Temp {tempDelta.dir} max/min by {tempDelta.value}°F
              </div>
            )}
            {rhDelta && (
              <div className="text-red-700">
                RH {rhDelta.dir} max/min by {rhDelta.value}%
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Helpers ----
function Pill({ children, className }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
        className
      )}
    >
      {children}
    </span>
  );
}

function relativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const sec = Math.max(1, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function nOrNull(n: number | null | undefined): number | null {
  return Number.isFinite(n as number) ? (n as number) : null;
}

function numOrDash(n: number | null) {
  return n == null ? "–" : formatNum(n);
}

function formatNum(n: number) {
  return Number.isInteger(n) ? n.toString() : n.toFixed(1);
}

function compactHiLo(high?: number | null, low?: number | null, unit?: string) {
  return {
    high: high == null ? "–" : formatNum(high),
    low: low == null ? "–" : formatNum(low),
    unit: unit ?? "",
  };
}

function rangeText(min?: number | null, max?: number | null, unit?: string) {
  if (min == null && max == null) return "–";
  if (min != null && max != null) return `${formatNum(min)}${unit}–${formatNum(max)}${unit}`;
  if (min != null) return `≥${formatNum(min)}${unit}`;
  return `≤${formatNum(max!)}${unit}`;
}
