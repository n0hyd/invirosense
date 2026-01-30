// components/LogoutButton.tsx
"use client";

import { useTransition } from "react";
import { logout } from "@/lib/auth/actions";

export default function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => logout())}
      disabled={pending}
      className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
    >
      {pending ? "Logging out..." : "Logout"}
    </button>
  );
}
