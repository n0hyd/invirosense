// Public Ingest API (service role wrapper around public.ingest_readings)
// POST JSON: { device_id: uuid, ingest_key: string, readings: [{ ts, temp_c, rh }, ...] }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SB_URL")!,               // set with: supabase secrets set SB_URL="https://<ref>.supabase.co"
  Deno.env.get("SB_SERVICE_ROLE_KEY")!   // set with: supabase secrets set SB_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqdGNjc2FndWdobHNvcWlrb2J6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzAwNjg0NywiZXhwIjoyMDcyNTgyODQ3fQ.XnNw5uG-yWGyoEbh4PtM1aBwUCjLYOAfpx5nHhLphew"
);

// Optional: quick sanity log to confirm env presence (remove after verifying)
console.log(JSON.stringify({
  level: "debug",
  msg: "ingest env-check",
  hasUrl: Boolean(Deno.env.get("SB_URL")),
  hasKey: Boolean(Deno.env.get("SB_SERVICE_ROLE_KEY")),
}));

function json(resBody: unknown, status = 200) {
  return new Response(JSON.stringify(resBody), {
    status,
    headers: {
      "content-type": "application/json",
      // Basic CORS (optional; keeps device firmware/http clients happy)
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization, apikey",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return json({ ok: true }, 200);

  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null) as {
      device_id?: string;
      ingest_key?: string;
      readings?: Array<{ ts: string; temp_c?: number; rh?: number }>;
    } | null;

    const device_id = body?.device_id;
    const ingest_key = body?.ingest_key;
    const readings = body?.readings;

    if (!device_id || !ingest_key || !Array.isArray(readings) || readings.length === 0) {
      return json({ error: "device_id, ingest_key, and non-empty readings[] required" }, 400);
    }

    const { error } = await supabase.rpc("ingest_readings", {
      p_device: device_id,
      p_ingest_key: ingest_key,
      readings_json: readings,
    });

    if (error) {
      console.log(JSON.stringify({
        level: "error",
        msg: "ingest failed",
        device_id,
        count: readings.length,
        error,
      }));
      return json({ error: error.message }, 500);
    }

    console.log(JSON.stringify({
      level: "info",
      msg: "ingest ok",
      device_id,
      count: readings.length,
    }));

    return json({ ok: true }, 200);
  } catch (e) {
    console.log(JSON.stringify({
      level: "error",
      msg: "ingest exception",
      error: String(e),
    }));
    return json({ error: "bad request" }, 400);
  }
});
