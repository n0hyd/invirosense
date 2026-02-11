"use client";

import * as React from "react";
import { Pencil } from "lucide-react";

export default function OrgNameEditor({
  orgId,
  initialName,
  canEdit,
}: {
  orgId: string;
  initialName: string;
  canEdit: boolean;
}) {
  const [name, setName] = React.useState(initialName);
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setError("Name cannot be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/orgs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, name: name.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "Update failed.");
      } else {
        setEditing(false);
      }
    } catch (err: any) {
      setError(err?.message || "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">{name}</h1>
        {canEdit && (
          <button
            className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            onClick={() => setEditing(true)}
            aria-label="Edit organization name"
            title="Edit organization name"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="w-80 max-w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-2xl font-bold tracking-tight text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <button
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          disabled={saving}
          onClick={save}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
          onClick={() => {
            setName(initialName);
            setError(null);
            setEditing(false);
          }}
        >
          Cancel
        </button>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
