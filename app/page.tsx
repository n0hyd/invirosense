// app/page.tsx
import DeviceCard from "@/components/DeviceCard";
import { getDevicesWithLatest } from "@/lib/queries/devices";

export default async function DashboardPage() {
  // Optional: pass a specific orgId if your UI has org selection
  const devices = await getDevicesWithLatest(); // or getDevicesWithLatest("20bd5053-f9d0-4e08-b35a-943513ced136")

  return (
    <div className="min-h-dvh bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900">Devices</h1>
          {/* future: filters / add button */}
        </div>

        {devices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center text-zinc-600">
            No devices yet. Seed a few or add one to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {devices.map((d) => (
              <DeviceCard
                key={d.id}
                id={d.id}
                name={d.name}
                location={d.location}
                model={d.model}
                firmware_version={d.firmware_version}
                last_seen={d.last_seen}
                status={d.status}
                latestTempC={d.latest_temp_c}
                latestRH={d.latest_rh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
