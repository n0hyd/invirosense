"use client";

import { useState } from "react";

type Props = {
  orgId: string;
};

type ClaimResponse = {
  code: string;
  expires_at: string;
};

export default function ClaimCodeCard({ orgId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [expiresInMinutes, setExpiresInMinutes] = useState<number>(15);

  async function generate() {
    setLoading(true);
    setError(null);
    setCode(null);
    setExpiresAt(null);
    try {
      const res = await fetch("/api/claim-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, expiresInMinutes }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to create claim code.");
      }
      const data = (await res.json()) as ClaimResponse;
      setCode(data.code);
      setExpiresAt(data.expires_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create claim code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">Device Claim Code</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Use this code in the device&apos;s setup portal to link it to this organization.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <label className="text-sm text-zinc-600">Expires in</label>
        <input
          type="number"
          min={5}
          max={120}
          step={5}
          value={expiresInMinutes}
          onChange={(e) => setExpiresInMinutes(Number(e.currentTarget.value))}
          className="w-24 rounded-lg border border-zinc-300 px-2 py-1 text-sm"
        />
        <span className="text-sm text-zinc-500">minutes</span>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {code && (
        <div className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Claim code</div>
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-900">{code}</div>
          <div className="mt-1 text-xs text-zinc-500">
            Expires {expiresAt ? new Date(expiresAt).toLocaleString() : "soon"}.
          </div>
        </div>
      )}
    </div>
  );
}
