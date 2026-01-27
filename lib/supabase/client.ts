// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

// Optional: import { Database } from "@/lib/types/supabase"; // if you have generated types

export function createClient() {
  return createBrowserClient/*<Database>*/(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
