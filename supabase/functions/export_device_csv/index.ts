import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SB_URL")!,
  Deno.env.get("SB_SERVICE_ROLE_KEY")!
);

function toCsv(rows: any[], headers: string[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const out = [headers.join(",")];
  for (const r of rows ?? []) {
    out.push(headers.map((h) => esc((r as Record<string, unknown>)[h])).join(","));
  }
  return out.join("\n");
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET, OPTIONS",
      },
    });
  }

  const url = new URL(req.url);
  const device_id = url.searchParams.get("device_id");
  const days = Number(url.searchParams.get("days") ?? "90");
  const tz = url.searchParams.get("tz") ?? "UTC"; // 👈 timezone param (optional)

  if (!device_id) {
    return new Response(JSON.stringify({ error: "device_id required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (Number.isNaN(days) || days <= 0) {
    return new Response(JSON.stringify({ error: "days must be a positive number" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const useHourly = days > 30;
  const rpcName = useHourly ? "export_device_hourly" : "export_device_raw";
  const headers = useHourly ? ["hour_local", "temp_c_avg", "rh_avg"] : ["ts_local", "temp_c", "rh"];

  const { data, error } = await supabase.rpc(rpcName, {
    p_device: device_id,
    p_days: days,
    p_tz: tz,                // 👈 pass timezone to RPC
  });

  if (error) {
    console.log(JSON.stringify({ level: "error", msg: "export failed", device_id, days, rpcName, tz, error }));
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const csv = toCsv(data ?? [], headers);
  const filename = `device_${device_id}_${useHourly ? "hourly" : "raw"}_${days}d_${tz.replaceAll("/", "-")}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "access-control-allow-origin": "*",
    },
  });
});
