import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ClaimCodeCard from "@/components/ClaimCodeCard";
import OrgInviteCard from "@/components/OrgInviteCard";
import OrgMembersTable from "@/components/OrgMembersTable";
import OrgInvitesTable from "@/components/OrgInvitesTable";
import { createAdminClient } from "@/lib/supabase/admin";
import OrgNameEditor from "@/components/OrgNameEditor";

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

  const { data: userData } = await supabase.auth.getUser();
  let myRole: string | null = null;
  const currentUserId = userData?.user?.id ?? null;
  if (userData?.user?.id) {
    const { data: myMember } = await supabase
      .from("memberships")
      .select("role")
      .eq("organization_id", id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    myRole = myMember?.role ?? null;
  }
  const canInvite = myRole === "owner" || myRole === "admin";
  const canManageMembers = canInvite;
  const canEditOrg = canInvite;

  let membersWithInfo =
    (members ?? []).map((m) => ({ ...m, email: null as string | null, name: null as string | null })) ?? [];

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    const enriched = await Promise.all(
      (members ?? []).map(async (m) => {
        const { data } = await admin.auth.admin.getUserById(m.user_id);
        const user = data?.user;
        const name =
          (user?.user_metadata?.display_name as string | undefined) ??
          (user?.user_metadata?.full_name as string | undefined) ??
          null;
        return { ...m, email: user?.email ?? null, name };
      })
    );
    membersWithInfo = enriched;
  }

  const { data: invites } = await supabase
    .from("org_invites")
    .select("email, role, status, created_at, last_sent_at")
    .eq("organization_id", id)
    .order("created_at", { ascending: false });

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
          <OrgNameEditor orgId={org.id} initialName={org?.name ?? ""} canEdit={canEditOrg} />
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

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Invite members</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Invite users by email and assign a role.
        </p>
        <div className="mt-3 max-w-2xl">
          <OrgInviteCard orgId={org.id} canInvite={canInvite} />
        </div>
      </section>

      {canInvite && (
        <section>
          <h2 className="text-lg font-semibold text-zinc-900">Pending invites</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Track outstanding invitations and resend if needed.
          </p>
          <OrgInvitesTable
            orgId={org.id}
            canManage={canInvite}
            invites={(invites ?? []).filter((i) => i.status === "pending")}
          />
        </section>
      )}

      {/* Members */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Members</h2>
        <OrgMembersTable
          orgId={org.id}
          currentUserId={currentUserId}
          canManage={canManageMembers}
          members={membersWithInfo}
        />
      </section>
    </div>
  );
}
