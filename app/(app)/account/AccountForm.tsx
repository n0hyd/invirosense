// app/(app)/account/AccountForm.tsx
"use client";

import { useState, useTransition } from "react";

type Props = {
  initialDisplayName: string;
  initialTimezone: string;
  saveAction: (formData: FormData) => Promise<void>;
};

const TIMEZONES = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
];

export default function AccountForm({
  initialDisplayName,
  initialTimezone,
  saveAction,
}: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => startTransition(() => saveAction(formData))}
      className="space-y-5"
    >
      {/* Display name */}
      <div className="space-y-2">
        <label htmlFor="display_name" className="text-sm font-medium text-zinc-900">
          Display name
        </label>
        <input
          id="display_name"
          name="display_name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g., Burke Jones"
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-0 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      {/* Time zone */}
      <div className="space-y-2">
        <label htmlFor="timezone" className="text-sm font-medium text-zinc-900">
          Time zone
        </label>
        <select
          id="timezone"
          name="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-0 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p className="text-xs text-zinc-500">
          Used for displaying timestamps across the app.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className={[
            "rounded-2xl border px-4 py-2 text-sm font-medium transition",
            isPending
              ? "bg-zinc-200 text-zinc-500 border-zinc-200 cursor-not-allowed"
              : "bg-zinc-900 text-white border-zinc-900 hover:brightness-95",
          ].join(" ")}
        >
          {isPending ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
