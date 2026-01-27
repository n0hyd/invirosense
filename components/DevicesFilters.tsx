// components/DevicesFilters.tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "ok", label: "OK" },
  { value: "alert", label: "Alert" },
  { value: "offline", label: "Offline" },
];

export default function DevicesFilters() {
  const sp = useSearchParams();
  const status = (sp.get("status") ?? "all").toLowerCase();

  return (
    <div className="inline-flex overflow-hidden rounded-xl ring-1 ring-zinc-700">
      {OPTIONS.map((opt, idx) => {
        const href = opt.value === "all" ? "/devices" : `/devices?status=${opt.value}`;
        const active = status === opt.value;
        return (
          <Link
            key={opt.value}
            href={href}
            className={clsx(
              "px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
              active ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700/70",
              idx !== 0 && "border-l border-zinc-700"
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
