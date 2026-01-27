// components/AppHeader.tsx
"use client";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import LogoutButton from "./LogoutButton";

export default function AppHeader({ user }: { user: User | null }) {
  return (
    <header className="bg-zinc-900 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Brand */}
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight hover:text-white"
          >
            invirosense
          </Link>

          {/* Right side */}
          {user ? (
            <div className="flex items-center gap-4">
              <nav className="hidden sm:flex items-center gap-6">
                <Link href="/devices" className="text-zinc-300 hover:text-white">
                  Dashboard
                </Link>
                <Link href="/orgs" className="text-zinc-300 hover:text-white">
                  Orgs
                </Link>
                <Link href="/account" className="text-zinc-300 hover:text-white">
                  Account
                </Link>
              </nav>
              <LogoutButton />
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
