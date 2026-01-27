// app/(app)/layout.tsx
import type { Metadata } from "next";
import AppHeaderServer from "@/components/AppHeaderServer";

export const metadata: Metadata = {
  title: "Invirosense",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-zinc-50">
      <AppHeaderServer />
      <main className="mx-auto max-w-7xl p-4">{children}</main>
    </div>
  );
}
