import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SB_URL")!,               // set via: supabase secrets set SB_URL="https://<ref>.supabase.co"
  Deno.env.get("SB_SERVICE_ROLE_KEY")!   // set via: supabase secrets set SB_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>"
);

// Optional one-time sanity log; remove after verifying secrets are present
console.log(JSON.stringify({
  level: "debug",
  msg: "firmware_check env-check",
  hasUrl: Boolean(Deno.env.get("SB_URL")),
  hasKey: Boolean(Deno.env.get("SB_SERVICE_ROLE_KEY")),
}));

function json(body: unknown, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: {
      "content-type": typeof body === "string" ? "text/plain;charset=UTF-8" : "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET, OPTIONS",
    },
  });
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return json("", 204);

  try {
    const url = new URL(req.url);
    const device_id = url.searchParams.get("device_id");
    const version = url.searchParams.get("version");
    const model = url.searchParams.get("model");
    const channel = url.searchParams.get("channel");

    if (!device_id || !version) {
      return json({ error: "device_id and version are required" }, 400);
    }

    const { data, error } = await supabase.rpc("firmware_check", {
      p_device: device_id,
      p_current_version: version,
      p_model: model,
      p_channel: channel,
    });

    if (error) {
      console.log(JSON.stringify({ level: "error", msg: "firmware_check failed", device_id, error }));
      return json({ error: error.message }, 500);
    }

    if (!data || data.length === 0) {
      console.log(JSON.stringify({ level: "info", msg: "firmware up-to-date", device_id, version }));
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "GET, OPTIONS",
        },
      });
    }

    const row = data[0];
    console.log(JSON.stringify({
      level: "info",
      msg: "firmware update available",
      device_id,
      from: version,
      to: row.target_version,
    }));
    return json(row, 200);
  } catch (e) {
    console.log(JSON.stringify({ level: "error", msg: "firmware_check exception", err: String(e) }));
    return json({ error: "unexpected" }, 500);
  }
});
