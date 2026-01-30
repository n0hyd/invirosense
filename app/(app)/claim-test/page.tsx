import { cookies } from "next/headers";
import Link from "next/link";
import ClaimDeviceTest from "@/components/ClaimDeviceTest";

export const dynamic = "force-dynamic";

export default async function ClaimTestPage() {
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("orgId")?.value ?? null;

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Device Claim Test</h1>
          <p className="mt-1 text-base text-zinc-600">
            Use this page to test claiming before the ESP32 portal is ready.
          </p>
        </div>
        <Link
          href={activeOrgId ? `/orgs/${activeOrgId}` : "/orgs"}
          className="text-sm text-zinc-700 hover:text-zinc-900 underline underline-offset-4"
        >
          Get claim code
        </Link>
      </div>

      <ClaimDeviceTest />
    </div>
  );
}
