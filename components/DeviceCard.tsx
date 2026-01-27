// components/DeviceCard.tsx — Equal Height + Last Check‑in under Current + Unit‑safe Alerts

import Link from "next/link";
import clsx from "clsx";
import { Thermometer, Droplets, Wifi, WifiOff, AlertTriangle } from "lucide-react";

export type DeviceCardProps = {
  device: {
    id: string;
    name: string;
    status?: string | null;
    temp_min?: number | null; // °C
    temp_max?: number | null; // °C
    rh_min?: number | null;   // %
    rh_max?: number | null;   // %
  };
  current: {
    tempC: number | null; // °C
    rh: number | null;    // %
    at?: string | null;   // ISO
  };
  stats24h?: {
    highTempC?: number | null; // °C
    lowTempC?: number | null;  // °C
    highRH?: number | null;    // %
    lowRH?: number | null;     // %
  };
  unit: "F" | "C";
  href?: string;
  expectedIntervalMin?: number; // default 15
};

// ---------- Helpers ----------
const cToF = (c: number) => (c * 9) / 5 + 32;
const fmtTempAbs = (c: number | null | undefined, unit: "F" | "C") => {
  if (c == null || !Number.isFinite(Number(c))) return "—";
  const v = Number(c);
  return unit === "F" ? `${cToF(v).toFixed(1)}°F` : `${v.toFixed(1)}°C`;
};
const fmtTempDelta = (cDiff: number, unit: "F" | "C") =>
  unit === "F" ? `${((cDiff * 9) / 5).toFixed(1)}°F` : `${cDiff.toFixed(1)}°C`;
const fmtRHAbs = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toFixed(0)}%`);

function timeAgo(tsISO?: string | null): string {
  if (!tsISO) return "never";
  const t = new Date(tsISO).getTime();
  if (!Number.isFinite(t)) return "never";
  const s = Math.max(0, Date.now() - t) / 1000;
  const m = Math.floor(s / 60);
  if (m < 1) return "just now";
  if (m === 1) return "1 minute ago";
  if (m < 60) return `${m} minutes ago`;
  const h = Math.floor(m / 60);
  if (h === 1) return "1 hour ago";
  if (h < 24) return `${h} hours ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

export default function DeviceCard({ device, current, stats24h, unit, href, expectedIntervalMin = 15 }: DeviceCardProps) {
  // Normalize inputs
  const tC = current?.tempC == null ? null : Number(current.tempC);
  const rh = current?.rh == null ? null : Number(current.rh);

  const tMinC = device?.temp_min == null ? null : Number(device.temp_min);
  const tMaxC = device?.temp_max == null ? null : Number(device.temp_max);
  const rhMin = device?.rh_min == null ? null : Number(device.rh_min);
  const rhMax = device?.rh_max == null ? null : Number(device.rh_max);

  const hiTempC = stats24h?.highTempC == null ? null : Number(stats24h.highTempC);
  const loTempC = stats24h?.lowTempC == null ? null : Number(stats24h.lowTempC);
  const hiRH = stats24h?.highRH == null ? null : Number(stats24h.highRH);
  const loRH = stats24h?.lowRH == null ? null : Number(stats24h.lowRH);

  // Breach checks
  const tempLow = tC != null && tMinC != null && tC < tMinC;
  const tempHigh = tC != null && tMaxC != null && tC > tMaxC;
  const rhLow = rh != null && rhMin != null && rh < rhMin;
  const rhHigh = rh != null && rhMax != null && rh > rhMax;
  const hasAnyAlert = !!(tempLow || tempHigh || rhLow || rhHigh);

  // Offline if last check-in > 2x expected interval
  const offline = (() => {
    if (!current?.at) return true;
    const atMs = new Date(current.at).getTime();
    if (!Number.isFinite(atMs)) return true;
    const maxAgeMs = 2 * expectedIntervalMin * 60 * 1000;
    return Date.now() - atMs > maxAgeMs;
  })();

  const alertLines: string[] = [];
  if (tempLow && tMinC != null && tC != null)  alertLines.push(`Temp under min by ${fmtTempDelta(tMinC - tC, unit)}`);
  if (tempHigh && tMaxC != null && tC != null) alertLines.push(`Temp over max by ${fmtTempDelta(tC - tMaxC, unit)}`);
  if (rhLow && rhMin != null && rh != null)    alertLines.push(`RH under min by ${Math.round(rhMin - rh)}%`);
  if (rhHigh && rhMax != null && rh != null)   alertLines.push(`RH over max by ${Math.round(rh - rhMax)}%`);

  const tempRangeLabel = `${fmtTempAbs(tMinC, unit)} – ${fmtTempAbs(tMaxC, unit)}`;
  const rhRangeLabel = `${fmtRHAbs(rhMin)} – ${fmtRHAbs(rhMax)}`;

  const currentTempLabel = fmtTempAbs(tC, unit);
  const currentRHLabel = rh == null ? "—" : `${rh.toFixed(1)}%`;

  const Pill = ({ children, variant }: { children: React.ReactNode; variant: "online" | "offline" | "alert" }) => (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] leading-none font-medium ring-1",
        variant === "alert" && "bg-red-50 text-red-700 ring-red-200",
        variant === "online" && "bg-emerald-50 text-emerald-700 ring-emerald-200",
        variant === "offline" && "bg-zinc-100 text-zinc-700 ring-zinc-200"
      )}
    >
      {variant === "offline" ? (
        <WifiOff className="h-3 w-3 mr-1" />
      ) : variant === "alert" ? (
        <AlertTriangle className="h-3 w-3 mr-1" />
      ) : (
        <Wifi className="h-3 w-3 mr-1" />
      )}
      {children}
    </span>
  );

  // --- Card UI (equal height) ---
  const cardInner = (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl border shadow-sm transition h-full",
        "bg-white text-zinc-900",
        (offline || hasAnyAlert) ? "border-red-300" : "border-zinc-200"
      )}
    >
      {/* Left alert stripe for either offline or alert */}
      <div className={clsx(
        "absolute left-0 top-0 h-full w-1",
        (offline || hasAnyAlert) ? "bg-red-500" : "bg-transparent"
      )} />

      <div className="p-4 flex flex-col gap-2 h-full">
        {/* Name + pills (priority: offline > alert > online) */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold leading-none truncate">{device?.name ?? "Sensor"}</h3>
          <div className="flex items-center gap-1.5">
            {offline ? (
              <Pill variant="offline">Offline</Pill>
            ) : hasAnyAlert ? (
              <Pill variant="alert">Alert</Pill>
            ) : (
              <Pill variant="online">Online</Pill>
            )}
          </div>
        </div>

        {/* Current readings */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Thermometer className="h-4 w-4" aria-hidden />
            <span className="text-lg font-bold">{currentTempLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Droplets className="h-4 w-4" aria-hidden />
            <span className="text-lg font-bold">{currentRHLabel}</span>
          </div>
        </div>

        {/* Last check-in right under current readings */}
        <p className="text-[11px] text-zinc-500">Last check‑in: {timeAgo(current?.at)}</p>

        {/* 24h hi/lo inline */}
        <div className="text-xs text-zinc-600 flex flex-wrap gap-x-4 gap-y-0.5">
          <div>
            <span className="font-medium">24h High:</span> {fmtTempAbs(hiTempC, unit)} · {fmtRHAbs(hiRH)}
          </div>
          <div>
            <span className="font-medium">24h Low:</span> {fmtTempAbs(loTempC, unit)} · {fmtRHAbs(loRH)}
          </div>
        </div>

        {/* Ranges */}
        <p className="text-xs text-zinc-600">
          <span className="font-medium">Ranges:</span> Temp {tempRangeLabel} · RH {rhRangeLabel}
        </p>

        {/* Alerts (stick to bottom, equal height) */}
        <div className="mt-auto min-h-[36px] space-y-0.5">
          {alertLines.length ? (
            alertLines.map((m, i) => (
              <p key={i} className="text-xs font-medium text-red-600">{m}</p>
            ))
          ) : (
            <p className="text-xs text-zinc-500">No alerts</p>
          )}
        </div>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-400 rounded-2xl">
      {cardInner}
    </Link>
  ) : (
    cardInner
  );
}
