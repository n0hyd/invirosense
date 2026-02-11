"use client";

import * as React from "react";

type RoleOption = "viewer" | "editor" | "admin";

export default function OrgInviteCard({
  orgId,
  canInvite,
}: {
  orgId: string;
  canInvite: boolean;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<RoleOption>("viewer");
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canInvite) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Email is required.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/org-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, email: trimmed, role, name: name.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "Invite failed.");
      } else {
        setMessage(`Invite sent to ${trimmed}.`);
        setName("");
        setEmail("");
        setRole("viewer");
      }
    } catch (err: any) {
      setError(err?.message || "Invite failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-zinc-900">Invite a member</h3>
      <p className="mt-1 text-sm text-zinc-600">
        Owners and admins can invite users to view devices.
      </p>
      <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto_auto]" onSubmit={onSubmit}>
        <input
          type="text"
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Full name (optional)"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          disabled={!canInvite || loading}
        />
        <input
          type="email"
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          disabled={!canInvite || loading}
        />
        <select
          className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={role}
          onChange={(e) => setRole(e.currentTarget.value as RoleOption)}
          disabled={!canInvite || loading}
        >
          <option value="viewer">Viewer (read-only)</option>
          <option value="editor">Editor (rename devices)</option>
          <option value="admin">Admin (manage org)</option>
        </select>
        <button
          type="submit"
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
          disabled={!canInvite || loading}
        >
          {loading ? "Sending..." : "Send invite"}
        </button>
      </form>
      {!canInvite && (
        <p className="mt-2 text-xs text-zinc-500">You don’t have permission to invite members.</p>
      )}
      {message && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
