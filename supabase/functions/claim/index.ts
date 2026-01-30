// Public Claim API (service role wrapper around public.claim_device)
// POST JSON: { device_id: uuid, claim_code: string }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SB_URL")!,
  Deno.env.get("SB_SERVICE_ROLE_KEY")!
);

function json(resBody: unknown, status = 200) {
  return new Response(JSON.stringify(resBody), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization, apikey",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  try {
    const body = await req.json().catch(() => null) as {
      device_id?: string;
      claim_code?: string;
    } | null;

    const device_id = body?.device_id;
    const claim_code = body?.claim_code;

    if (!device_id || !claim_code) {
      return json({ error: "device_id and claim_code required" }, 400);
    }

    const { data, error } = await supabase.rpc("claim_device", {
      p_device: device_id,
      p_code: claim_code,
    });

    if (error) {
      console.log(JSON.stringify({
        level: "error",
        msg: "claim failed",
        device_id,
        error,
      }));
      return json({ error: error.message }, 400);
    }

    return json({ ok: true, ingest_key: data }, 200);
  } catch (e) {
    console.log(JSON.stringify({
      level: "error",
      msg: "claim exception",
      error: String(e),
    }));
    return json({ error: "bad request" }, 400);
  }
});
