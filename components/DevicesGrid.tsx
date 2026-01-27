// components/DevicesGrid.tsx
"use client";

import { useSearchParams } from "next/navigation";
import DeviceCard from "@/components/DeviceCard";

export default function DevicesGrid({ devices }: { devices: any[] }) {
  const sp = useSearchParams();
  const status = (sp.get("status") ?? "all").toLowerCase();

  const visible =
    status === "all"
      ? devices
      : devices.filter((d: any) => (d.status ?? "offline").toLowerCase() === status);

  if (!visible.length) {
    return <p className="text-sm text-zinc-100">No devices match this filter.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((d: any) => (
        <DeviceCard key={d.id} device={d} />
      ))}
    </div>
  );
}
