// components/StatusBadge.tsx
import clsx from "clsx";

type Status = "ok" | "alert" | "offline" | "unknown";

export default function StatusBadge({ status }: { status?: string | null }) {
  const s = (status?.toLowerCase() as Status) || "unknown";
  const styles = {
    ok: "bg-green-100 text-green-700 ring-green-200",
    alert: "bg-amber-100 text-amber-800 ring-amber-200",
    offline: "bg-zinc-200 text-zinc-700 ring-zinc-300",
    unknown: "bg-zinc-200 text-zinc-700 ring-zinc-300",
  }[s];

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1",
        styles
      )}
      aria-label={`status: ${s}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current/70" />
      {s}
    </span>
  );
}
