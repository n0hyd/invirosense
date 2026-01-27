import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createServerClient } from "@/lib/supabase/server";
import AccountForm from "./AccountForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login?next=/account");
  }

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ?? "";
  const timezone =
    (user.user_metadata?.timezone as string | undefined) ?? "America/Chicago";

  async function saveProfile(formData: FormData) {
    "use server";
    const supa = await createServerClient();
    const {
      data: { user: u },
    } = await supa.auth.getUser();
    if (!u) redirect("/login?next=/account");

    const display_name = String(formData.get("display_name") || "").trim();
    const tz = String(formData.get("timezone") || "America/Chicago");

    const { error: updateErr } = await supa.auth.updateUser({
      data: {
        display_name,
        timezone: tz,
      },
    });

    if (updateErr) {
      console.error("updateUser error:", updateErr);
      // Optional: surface error via search params or a toast
    }

    revalidatePath("/account");
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Account</h1>
        <p className="mt-1 text-base text-zinc-600">
          Manage your profile and preferences.
        </p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="p-6 space-y-4">
          <div>
            <div className="text-sm text-zinc-600">Email</div>
            <div className="text-base font-medium text-zinc-900">{user.email}</div>
          </div>

          <div className="h-px bg-zinc-200" />

          <AccountForm
            initialDisplayName={displayName}
            initialTimezone={timezone}
            saveAction={saveProfile}
          />
        </div>
      </div>
    </div>
  );
}
