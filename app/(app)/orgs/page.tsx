import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OrgsPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("orgId")?.value ?? null;

  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name, created_at")
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-4">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Organizations</h1>
        <p className="mt-4 text-red-600">Error: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Organizations</h1>
        <p className="mt-1 text-base text-zinc-600">Select or manage your organizations.</p>
      </div>

      {/* List */}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(orgs ?? []).map((org) => {
          const isActive = activeOrgId === org.id;
          return (
            <li key={org.id}>
              <div
                className={[
                  "group rounded-2xl border border-zinc-200 bg-white shadow-sm",
                  "transition hover:shadow-md h-full flex flex-col",
                ].join(" ")}
              >
                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/orgs/${org.id}`}
                      className="text-lg font-semibold text-zinc-900 hover:underline underline-offset-4"
                    >
                      {org.name}
                    </Link>
                    <span
                      className={[
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        isActive
                          ? "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                          : "bg-zinc-100 text-zinc-700 ring-1 ring-inset ring-zinc-200",
                      ].join(" ")}
                    >
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-zinc-500">
                    {org.created_at ? new Date(org.created_at).toLocaleString() : ""}
                  </div>

                  <div className="mt-3">
                    <Link
                      href={`/orgs/${org.id}`}
                      className="text-sm text-zinc-700 hover:text-zinc-900 underline underline-offset-4"
                    >
                      View details
                    </Link>
                  </div>
                </div>

                <div className="border-t border-zinc-200 p-3">
                  <form
                    action={async () => {
                      "use server";
                      const c = await cookies();
                      c.set("orgId", org.id, {
                        httpOnly: true,
                        sameSite: "lax",
                        maxAge: 60 * 60 * 24 * 30,
                        path: "/",
                      });
                    }}
                  >
                    <button
                      className={[
                        "w-full text-sm rounded-xl px-3 py-2 border transition",
                        isActive
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50",
                      ].join(" ")}
                    >
                      {isActive ? "Current Active Org" : "Set Active"}
                    </button>
                  </form>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {(!orgs || orgs.length === 0) && (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600">
          No organizations yet.
        </div>
      )}
    </div>
  );
}
