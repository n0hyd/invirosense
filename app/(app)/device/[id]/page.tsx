import { createClient } from "@/lib/supabase/server";
import DevicePage from "./DevicePage";


export const dynamic = "force-dynamic";


const DEVICE_FIELDS = [
"id",
"name",
"organization_id",
"status",
"last_seen",
"temp_min",
"temp_max",
"rh_min",
"rh_max",
"model",
"channel",
"firmware_version",
"report_interval_min",
"sample_interval_min",
] as const;


type PageProps = {
params: Promise<{ id: string }>; // Next 15: async dynamic APIs
searchParams: Promise<Record<string, string | string[]>>;
};


export default async function Page({ params, searchParams }: PageProps) {
// ✅ Await before using (Next.js 15 requirement)
const [{ id }, sp] = await Promise.all([params, searchParams]);


const unitParam = (typeof sp?.unit === "string"
? sp.unit
: Array.isArray(sp?.unit)
? sp.unit[0]
: undefined) as "F" | "C" | undefined;
const unit: "F" | "C" = unitParam === "C" ? "C" : "F"; // default F to match dashboard feel


const supabase = await createClient();
const { data: device, error } = await supabase
.from("devices")
.select(DEVICE_FIELDS.join(","))
.eq("id", id)
.single();


if (error || !device) {
return (
<div className="max-w-3xl py-10">
<h1 className="text-2xl font-semibold">Device not available</h1>
<p className="mt-2 text-sm text-zinc-500">Check logs for details.</p>
</div>
);
}

const { data: userData } = await supabase.auth.getUser();
let role: string | null = null;
if (userData?.user?.id && device.organization_id) {
const { data: member } = await supabase
.from("memberships")
.select("role")
.eq("user_id", userData.user.id)
.eq("organization_id", device.organization_id)
.maybeSingle();
role = member?.role ?? null;
}

const canEditDevice = role === "owner" || role === "admin" || role === "editor";
const canDeleteDevice = role === "owner";


return (
<DevicePage
device={device}
unit={unit}
expectedIntervalMin={15}
canEditDevice={canEditDevice}
canDeleteDevice={canDeleteDevice}
/>
);
}
