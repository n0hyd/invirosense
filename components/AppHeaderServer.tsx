// components/AppHeaderServer.tsx
import { createClient } from "@/lib/supabase/server";
import AppHeader from "./AppHeader";

export default async function AppHeaderServer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <AppHeader user={user} />;
}
