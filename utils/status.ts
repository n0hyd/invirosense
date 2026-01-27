// utils/status.ts
export type Breach = "low" | "high" | null;

export function breachDir(val: number | null | undefined, min?: number | null, max?: number | null): Breach {
  if (val == null || Number.isNaN(val)) return null;
  if (typeof min === "number" && val < min) return "low";
  if (typeof max === "number" && val > max) return "high";
  return null;
}

export function computePillStatus(params: {
  lastSeenIso?: string | null;             // devices.last_seen
  reportIntervalMin?: number | null;       // devices.report_interval_min (default 15)
  latestTempC?: number | null;             // (if you fetch current reading for card)
  latestRh?: number | null;                // (if you fetch current reading for card)
  tempMin?: number | null;
  tempMax?: number | null;
  rhMin?: number | null;
  rhMax?: number | null;
}) {
  const interval = Math.max(5, Math.min(120, params.reportIntervalMin ?? 15));
  const deadlineMs = interval * 2 * 60 * 1000;

  const lastSeen = params.lastSeenIso ? new Date(params.lastSeenIso).getTime() : 0;
  const age = Date.now() - lastSeen;

  if (!lastSeen || age > deadlineMs) return "offline" as const;

  const tempB = breachDir(params.latestTempC ?? null, params.tempMin, params.tempMax);
  const rhB = breachDir(params.latestRh ?? null, params.rhMin, params.rhMax);
  if (tempB || rhB) return "alert" as const;

  return "online" as const;
}
