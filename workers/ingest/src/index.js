/**
 * JK-BMS Ingestion Worker ("jkbms-cloud")
 *
 * Dedicated endpoint for ESP32 telemetry ingestion.
 * Writes BMS readings & per-cell voltages to Cloudflare D1.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ── POST /api/telemetry ─────────────────────────────────
    if (url.pathname === "/api/telemetry" && request.method === "POST") {
      const apiKey = request.headers.get("X-API-Key");
      if (env.API_KEY && apiKey !== env.API_KEY) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const body = await request.json();
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

        // 1) Insert pack-level telemetry
        await env.DB.prepare(`
          INSERT INTO bms_telemetry (
            total_voltage, current, soc, capacity_remaining,
            temp_mos, temp_battery_1, temp_battery_2,
            charging_enabled, discharging_enabled
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          total_voltage, current, soc, capacity_remaining,
          temp_mos, temp_battery_1, temp_battery_2,
          charging_enabled, discharging_enabled
        ).run();

        // 2) Fetch telemetry ID
        const row = await env.DB.prepare("SELECT last_insert_rowid() as id").first();
        const telemetryId = row?.id;

        // 3) Batch insert individual cell voltages into cell_data
        const cells = Array.isArray(cell_voltages) ? cell_voltages : [];
        if (telemetryId && cells.length > 0) {
          const stmts = cells.map((v, i) =>
            env.DB.prepare(
              "INSERT INTO cell_data (telemetry_id, cell_index, voltage) VALUES (?, ?, ?)"
            ).bind(telemetryId, i, Number(v))
          );
          await env.DB.batch(stmts);
        }

        return new Response(JSON.stringify({ success: true, id: telemetryId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Health check endpoint
    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response(JSON.stringify({ status: "ok", service: "jkbms-ingest" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};

