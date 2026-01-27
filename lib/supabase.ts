import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Use implicit flow so the email link works even if it opens in another browser/app
export const supabase = createClient(url, anonKey, {
  auth: { flowType: "implicit" },
});
