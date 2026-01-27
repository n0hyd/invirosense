"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type OrgOption = { id: string; name: string };

export default function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: OrgOption[];
  activeOrgId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(activeOrgId ?? "");

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const orgId = e.target.value;
    setValue(orgId);
    await fetch("/api/switch-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <label className="flex items-center gap-2">
      <span className="text-sm text-gray-600">Org</span>
      <select
        className="border rounded-md px-2 py-1 text-sm"
        value={value}
        onChange={onChange}
        disabled={pending}
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
