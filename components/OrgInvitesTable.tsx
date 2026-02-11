"use client";

import * as React from "react";

type InviteRow = {
  email: string;
  role: string;
  status: string;
  created_at: string;
  last_sent_at: string;
};

export default function OrgInvitesTable({
  orgId,
  canManage,
  invites,
}: {
  orgId: string;
  canManage: boolean;
  invites: InviteRow[];
}) {
  const [sending, setSending] = React.useState<Set<string>>(new Set());
  const [errorMap, setErrorMap] = React.useState<Record<string, string | null>>({});

  const setSendingFor = (email: string, value: boolean) => {
    setSending((prev) => {
      const next = new Set(prev);
      if (value) next.add(email);
      else next.delete(email);
      return next;
    });
  };

  const resend = async (email: string) => {
    if (!canManage) return;
    setSendingFor(email, true);
    setErrorMap((m) => ({ ...m, [email]: null }));
    try {
      const res = await fetch("/api/org-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMap((m) => ({ ...m, [email]: json?.error || "Resend failed." }));
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setErrorMap((m) => ({ ...m, [email]: err?.message || "Resend failed." }));
    } finally {
      setSendingFor(email, false);
    }
  };

  const revoke = async (email: string) => {
    if (!canManage) return;
    const ok = window.confirm("Revoke this invite?");
    if (!ok) return;
    setSendingFor(email, true);
    setErrorMap((m) => ({ ...m, [email]: null }));
    try {
      const res = await fetch("/api/org-invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMap((m) => ({ ...m, [email]: json?.error || "Revoke failed." }));
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setErrorMap((m) => ({ ...m, [email]: err?.message || "Revoke failed." }));
    } finally {
      setSendingFor(email, false);
    }
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600">
        <div>Email</div>
        <div>Status</div>
        <div>Role</div>
        <div>Actions</div>
      </div>

      {invites.map((i) => {
        const isSending = sending.has(i.email);
        const error = errorMap[i.email];
        return (
          <div key={i.email} className="border-b last:border-b-0 border-zinc-200">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 px-4 py-3">
              <div className="truncate text-sm text-zinc-900">{i.email}</div>
              <div className="text-xs text-zinc-600">{i.status}</div>
              <div className="text-xs text-zinc-600">{i.role}</div>
              <div>
                {canManage ? (
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      onClick={() => resend(i.email)}
                      disabled={isSending}
                    >
                      {isSending ? "Sending..." : "Resend"}
                    </button>
                    <button
                      className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                      onClick={() => revoke(i.email)}
                      disabled={isSending}
                    >
                      Revoke
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-zinc-400">—</span>
                )}
              </div>
            </div>
            {error && <div className="px-4 pb-3 text-xs text-red-600">{error}</div>}
          </div>
        );
      })}

      {invites.length === 0 && (
        <div className="px-4 py-6 text-sm text-zinc-600">No pending invites.</div>
      )}
    </div>
  );
}
