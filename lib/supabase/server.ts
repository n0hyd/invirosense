// lib/supabase/server.ts
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
// import type { Database } from "@/lib/types/supabase"; // if you have types

export async function createClient() {
  const cookieStore = await cookies();
  const headersList = await headers();

  const supabase = createServerClient/*<Database>*/(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options, expires: new Date(0) });
        },
      },
      // headers: { ...headersList }, // optional; usually not required
    }
  );

  return supabase;
}
