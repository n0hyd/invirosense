"use client";

import * as React from "react";

type MemberRow = {
  user_id: string;
  role: string;
  email?: string | null;
  name?: string | null;
};

const ROLE_OPTIONS = ["owner", "admin", "editor", "viewer"] as const;

export default function OrgMembersTable({
  orgId,
  currentUserId,
  canManage,
  members,
}: {
  orgId: string;
  currentUserId: string | null;
  canManage: boolean;
  members: MemberRow[];
}) {
  const [savingIds, setSavingIds] = React.useState<Set<string>>(new Set());
  const [errorMap, setErrorMap] = React.useState<Record<string, string | null>>({});

  const setSaving = (id: string, saving: boolean) => {
    setSavingIds((prev) => {
      const next = new Set(prev);
      if (saving) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const onRoleChange = async (userId: string, role: string) => {
    if (!canManage) return;
    setSaving(userId, true);
    setErrorMap((m) => ({ ...m, [userId]: null }));
    try {
      const res = await fetch("/api/org-members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, userId, role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMap((m) => ({ ...m, [userId]: json?.error || "Update failed." }));
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setErrorMap((m) => ({ ...m, [userId]: err?.message || "Update failed." }));
    } finally {
      setSaving(userId, false);
    }
  };

  const onRemove = async (userId: string) => {
    if (!canManage) return;
    const ok = window.confirm("Remove this member from the organization?");
    if (!ok) return;
    setSaving(userId, true);
    setErrorMap((m) => ({ ...m, [userId]: null }));
    try {
      const res = await fetch("/api/org-members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, userId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMap((m) => ({ ...m, [userId]: json?.error || "Remove failed." }));
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setErrorMap((m) => ({ ...m, [userId]: err?.message || "Remove failed." }));
    } finally {
      setSaving(userId, false);
    }
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600">
        <div>User</div>
        <div>Role</div>
        <div>Actions</div>
      </div>

      {members.map((m) => {
        const isSaving = savingIds.has(m.user_id);
        const error = errorMap[m.user_id];
        const isMe = currentUserId && currentUserId === m.user_id;
        const label =
          m.name || m.email ? `${m.name ?? ""}${m.name && m.email ? " · " : ""}${m.email ?? ""}` : m.user_id;
        return (
          <div key={m.user_id} className="border-b last:border-b-0 border-zinc-200">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm text-zinc-900">
                  {label}
                  {isMe && <span className="ml-2 text-xs text-zinc-500">(you)</span>}
                </div>
                {(m.name || m.email) && (
                  <div className="truncate text-xs text-zinc-500 font-mono">{m.user_id}</div>
                )}
              </div>
              <div>
                {canManage ? (
                  <select
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={m.role}
                    onChange={(e) => onRoleChange(m.user_id, e.currentTarget.value)}
                    disabled={isSaving}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-700 ring-1 ring-inset ring-zinc-200">
                    {m.role}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canManage ? (
                  <button
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                    onClick={() => onRemove(m.user_id)}
                    disabled={isSaving}
                  >
                    Remove
                  </button>
                ) : (
                  <span className="text-xs text-zinc-400">—</span>
                )}
              </div>
            </div>
            {error && (
              <div className="px-4 pb-3 text-xs text-red-600">{error}</div>
            )}
          </div>
        );
      })}

      {members.length === 0 && (
        <div className="px-4 py-6 text-sm text-zinc-600">No members yet.</div>
      )}
    </div>
  );
}
