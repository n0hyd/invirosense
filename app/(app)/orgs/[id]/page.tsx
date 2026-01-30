import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ClaimCodeCard from "@/components/ClaimCodeCard";

type Params = { id: string };

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<Params>; // Next 15: params is a Promise
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name, created_at")
    .eq("id", id)
    .single();

  if (orgErr) {
    return (
      <div className="mx-auto max-w-7xl p-4">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Organization</h1>
        <p className="mt-2 text-red-600">Error: {orgErr.message}</p>
      </div>
    );
  }

  const { data: members } = await supabase
    .from("memberships")
    .select("user_id, role")
    .eq("organization_id", id)
    .order("role", { ascending: false });

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm">
            <Link href="/orgs" className="text-zinc-600 hover:text-zinc-900 underline underline-offset-4">
              ← Back to organizations
            </Link>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">{org?.name}</h1>
          <div className="mt-1 text-xs text-zinc-500">
            <span className="font-mono">ID: {org?.id}</span>
            {org?.created_at && (
              <>
                <span className="px-2">-</span>
                Created {new Date(org.created_at).toLocaleString()}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Members */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Add a device</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Generate a temporary code and enter it on the device&apos;s setup portal.
        </p>
        <div className="mt-3 max-w-xl">
          <ClaimCodeCard orgId={org.id} />
        </div>
      </section>

      {/* Members */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Members</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600">
            <div>User ID</div>
            <div>Role</div>
          </div>

          {(members ?? []).map((m) => (
            <div
              key={m.user_id}
              className="grid grid-cols-[1fr_auto] items-center gap-2 px-4 py-3 border-b last:border-b-0 border-zinc-200"
            >
              <span className="font-mono text-sm text-zinc-800 break-words">{m.user_id}</span>
              <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-700 ring-1 ring-inset ring-zinc-200">
                {m.role}
              </span>
            </div>
          ))}

          {(!members || members.length === 0) && (
            <div className="px-4 py-6 text-sm text-zinc-600">No members yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
