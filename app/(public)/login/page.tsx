// app/(public)/login/page.tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const nextParam = searchParams.get("next") || "/orgs";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    // Build callback URL on the client, so window.location.origin is defined
    const origin = window.location.origin;
    const url = new URL("/auth/callback", origin);
    url.searchParams.set("next", nextParam);
    const emailRedirectTo = url.toString();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });

    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }
    setStatus("sent");
  };

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold mb-4">Sign in</h1>

      {status === "sent" ? (
        <div className="rounded-md border p-4">
          Check your email for a magic link. Once you click it, we’ll send you
          back to: <code className="px-1">{nextParam}</code>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={status === "sending"}
            className="rounded-md border px-4 py-2"
          >
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      <p className="mt-4 text-sm text-gray-600">
        After signing in you’ll return to <code className="px-1">{nextParam}</code>
      </p>
    </div>
  );
}
