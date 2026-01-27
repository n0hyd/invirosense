// components/SkeletonDeviceCard.tsx
"use client";

export default function SkeletonDeviceCard() {
  return (
    <article className="rounded-2xl border border-zinc-800/50 bg-zinc-900 p-4 shadow-sm animate-pulse">
      {/* Title + status pill */}
      <div className="mb-2 flex items-center justify-between">
        <div className="h-4 w-32 rounded bg-zinc-700/60" />
        <div className="h-5 w-16 rounded bg-zinc-700/60" />
      </div>

      {/* Meta rows */}
      <div className="mb-3 space-y-2">
        <div className="h-3 w-28 rounded bg-zinc-700/50" />
        <div className="h-3 w-20 rounded bg-zinc-700/50" />
      </div>

      {/* Readings */}
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-zinc-700/50" />
        <div className="h-4 w-20 rounded bg-zinc-700/50" />
        <div className="h-3 w-36 rounded bg-zinc-700/40" />
      </div>
    </article>
  );
}
