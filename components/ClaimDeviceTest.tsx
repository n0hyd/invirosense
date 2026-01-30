"use client";

import { useMemo, useState } from "react";

const CLAIM_NAMESPACE_UUID = "9f0f1b2e-4b7c-4d1c-9f2a-0b6a2e0b1f5a";

function hexToBytes(hex: string) {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function uuidToBytes(uuid: string) {
  return hexToBytes(uuid.replace(/-/g, ""));
}

function bytesToUuid(bytes: Uint8Array) {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

async function uuidV5(namespaceUuid: string, name: string) {
  const ns = uuidToBytes(namespaceUuid);
  const nameBytes = new TextEncoder().encode(name.toLowerCase());
  const toHash = new Uint8Array(ns.length + nameBytes.length);
  toHash.set(ns, 0);
  toHash.set(nameBytes, ns.length);

  const digest = await crypto.subtle.digest("SHA-1", toHash);
  const hash = new Uint8Array(digest).slice(0, 16);
  // Set version (5) and variant (RFC 4122)
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return bytesToUuid(hash);
}

export default function ClaimDeviceTest() {
  const [deviceId, setDeviceId] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [mac, setMac] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [ingestKey, setIngestKey] = useState("");
  const [tempC, setTempC] = useState("23.4");
  const [rh, setRh] = useState("45");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const functionUrl = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return null;
    return `${base}/functions/v1/claim`;
  }, []);

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const ingestUrl = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return null;
    return `${base}/functions/v1/ingest`;
  }, []);

  async function onGenerateFromMac() {
    setError(null);
    setInfo(null);
    const raw = mac.trim();
    if (!raw) {
      setError("Enter a MAC address first.");
      return;
    }
    if (!crypto?.subtle) {
      setError("This browser does not support crypto.subtle. Try a modern browser.");
      return;
    }
    const id = await uuidV5(CLAIM_NAMESPACE_UUID, raw);
    setDeviceId(id);
    setInfo(`Generated UUID from MAC ${raw}.`);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      if (!functionUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
      if (!deviceId || !claimCode) throw new Error("device_id and claim_code are required.");

      const res = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
        },
        body: JSON.stringify({ device_id: deviceId, claim_code: claimCode }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || `Claim failed (${res.status}).`);
      }
      setResponse(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed.");
    } finally {
      setLoading(false);
    }
  }

  async function onCreateFactory() {
    setCreating(true);
    setError(null);
    setResponse(null);
    try {
      if (!deviceId) throw new Error("device_id is required.");
      const res = await fetch("/api/factory-device", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_id: deviceId, name: deviceName }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || `Create failed (${res.status}).`);
      }
      setResponse(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  }

  async function onSendTestReading() {
    setSending(true);
    setError(null);
    setResponse(null);
    try {
      if (!ingestUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
      if (!deviceId || !ingestKey) throw new Error("device_id and ingest_key are required.");
      const nowIso = new Date().toISOString();
      const res = await fetch(ingestUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
        },
        body: JSON.stringify({
          device_id: deviceId,
          ingest_key: ingestKey,
          readings: [
            {
              ts: nowIso,
              temp_c: tempC === "" ? null : Number(tempC),
              rh: rh === "" ? null : Number(rh),
            },
          ],
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || `Ingest failed (${res.status}).`);
      }
      setResponse(text);
      setInfo(`Sent reading at ${nowIso}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingest failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-zinc-900">Device Claim Test</h3>
      <p className="mt-1 text-sm text-zinc-600">
        Call the claim function manually before the ESP32 flow is ready.
      </p>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block">
          <span className="text-sm text-zinc-600">Device ID (UUID)</span>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            value={deviceId}
            onChange={(e) => setDeviceId(e.currentTarget.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </label>

        <label className="block">
          <span className="text-sm text-zinc-600">Temporary device name (optional)</span>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            value={deviceName}
            onChange={(e) => setDeviceName(e.currentTarget.value)}
            placeholder="Unclaimed Sensor"
          />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[220px]">
            <span className="text-sm text-zinc-600">MAC address (optional)</span>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              value={mac}
              onChange={(e) => setMac(e.currentTarget.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
            />
          </label>
          <button
            type="button"
            onClick={onGenerateFromMac}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Generate UUID from MAC
          </button>
        </div>

        <label className="block">
          <span className="text-sm text-zinc-600">Claim code</span>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            value={claimCode}
            onChange={(e) => setClaimCode(e.currentTarget.value)}
            placeholder="8-char code"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCreateFactory}
            disabled={creating}
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create unclaimed device"}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? "Claiming..." : "Claim Device"}
          </button>
        </div>

        <div className="mt-4 border-t border-zinc-200 pt-4">
          <h4 className="text-sm font-semibold text-zinc-900">Send test reading</h4>
          <p className="mt-1 text-sm text-zinc-600">
            Use the ingest key returned from a successful claim.
          </p>

          <label className="mt-3 block">
            <span className="text-sm text-zinc-600">Ingest key</span>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              value={ingestKey}
              onChange={(e) => setIngestKey(e.currentTarget.value)}
              placeholder="paste ingest key"
            />
          </label>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm text-zinc-600">Temp (°C)</span>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                value={tempC}
                onChange={(e) => setTempC(e.currentTarget.value)}
                placeholder="23.4"
              />
            </label>
            <label className="block">
              <span className="text-sm text-zinc-600">RH (%)</span>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                value={rh}
                onChange={(e) => setRh(e.currentTarget.value)}
                placeholder="45"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={onSendTestReading}
            disabled={sending}
            className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
          >
            {sending ? "Sending..." : "Send test reading"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {info && (
        <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 ring-1 ring-blue-200">
          {info}
        </div>
      )}

      {response && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <pre className="whitespace-pre-wrap">{response}</pre>
        </div>
      )}

      <p className="mt-3 text-xs text-zinc-500">
        UUID namespace for MAC-derived IDs: {CLAIM_NAMESPACE_UUID}
      </p>
    </div>
  );
}
