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
      device_name?: string;
    } | null;

    const device_id = body?.device_id;
    const claim_code = body?.claim_code;
    const device_name = (body?.device_name ?? "").toString().trim();

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

    // If claim_device returned null, the device likely doesn't exist yet.
    if (!data) {
      const { data: codeRow, error: codeErr } = await supabase
        .from("claim_codes")
        .select("organization_id, expires_at")
        .eq("code", claim_code)
        .maybeSingle();

      if (codeErr || !codeRow || new Date(codeRow.expires_at) <= new Date()) {
        return json({ error: "invalid or expired claim code" }, 400);
      }

      const name =
        device_name || `Device ${device_id.slice(0, 8)}`;

      const { error: insertErr } = await supabase
        .from("devices")
        .upsert(
          { id: device_id, organization_id: codeRow.organization_id, name },
          { onConflict: "id" }
        );

      if (insertErr) {
        console.log(JSON.stringify({
          level: "error",
          msg: "device create failed",
          device_id,
          error: insertErr,
        }));
        return json({ error: "device create failed" }, 400);
      }

      const { data: retryData, error: retryErr } = await supabase.rpc("claim_device", {
        p_device: device_id,
        p_code: claim_code,
      });

      if (retryErr || !retryData) {
        console.log(JSON.stringify({
          level: "error",
          msg: "claim retry failed",
          device_id,
          error: retryErr,
        }));
        return json({ error: "claim retry failed" }, 400);
      }

      return json({ ok: true, ingest_key: retryData }, 200);
    }

    if (device_name) {
      const { error: nameErr } = await supabase
        .from("devices")
        .update({ name: device_name })
        .eq("id", device_id);
      if (nameErr) {
        console.log(JSON.stringify({
          level: "warn",
          msg: "claim name update failed",
          device_id,
          error: nameErr,
        }));
      }
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
