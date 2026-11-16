// Supabase Edge Function: Ingest JK-BMS Telemetry
// Automatically deployed by Supabase GitHub integration
// Endpoint: POST https://<project-ref>.supabase.co/functions/v1/telemetry

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const {
      total_voltage = 0,
      current = 0,
      soc = 0,
      capacity_remaining = 0,
      temp_mos = 0,
      temp_battery_1 = 0,
      temp_battery_2 = 0,
      charging_enabled = 1,
      discharging_enabled = 1,
      cell_voltages = [],
    } = body;

    // 1. Insert pack telemetry
    const { data: telemetry, error: telemetryError } = await supabaseClient
      .from("bms_telemetry")
      .insert({
        total_voltage,
        current,
        soc,
        capacity_remaining,
        temp_mos,
        temp_battery_1,
        temp_battery_2,
        charging_enabled,
        discharging_enabled,
      })
      .select("id")
      .single();

    if (telemetryError) {
      throw telemetryError;
    }

    const telemetryId = telemetry.id;

    // 2. Batch insert cells
    const cells = Array.isArray(cell_voltages) ? cell_voltages : [];
    if (cells.length > 0) {
      const cellRows = cells.map((voltage: number, cell_index: number) => ({
        telemetry_id: telemetryId,
        cell_index,
        voltage: Number(voltage),
      }));

      const { error: cellError } = await supabaseClient
        .from("cell_data")
        .insert(cellRows);

      if (cellError) {
        console.error("Error inserting cell_data:", cellError);
      }
    }

    return new Response(JSON.stringify({ success: true, id: telemetryId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

