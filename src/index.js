export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. Ingest telemetry from ESP32
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
          power = (total_voltage * current),
          soc = 0,
          capacity_remaining = 0,
          cell_min_voltage = 0,
          cell_max_voltage = 0,
          cell_diff = (cell_max_voltage - cell_min_voltage),
          temp_mos = 0,
          temp_battery_1 = 0,
          temp_battery_2 = 0,
          charging_enabled = 1,
          discharging_enabled = 1,
          cell_voltages = "[]",
        } = body;

        const cellVoltagesStr = typeof cell_voltages === "string" 
          ? cell_voltages 
          : JSON.stringify(cell_voltages);

        await env.DB.prepare(
          `INSERT INTO bms_telemetry (
            total_voltage, current, power, soc, capacity_remaining,
            cell_min_voltage, cell_max_voltage, cell_diff,
            temp_mos, temp_battery_1, temp_battery_2,
            charging_enabled, discharging_enabled, cell_voltages
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          total_voltage, current, power, soc, capacity_remaining,
          cell_min_voltage, cell_max_voltage, cell_diff,
          temp_mos, temp_battery_1, temp_battery_2,
          charging_enabled, discharging_enabled, cellVoltagesStr
        ).run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2. Fetch Latest Record for Dashboard
    if (url.pathname === "/api/latest" && request.method === "GET") {
      const result = await env.DB.prepare(
        "SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT 1"
      ).first();

      return new Response(JSON.stringify(result || {}), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Fetch History for Charts (last N records)
    if (url.pathname === "/api/history" && request.method === "GET") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
      const results = await env.DB.prepare(
        "SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT ?"
      ).bind(limit).all();

      return new Response(JSON.stringify((results.results || []).reverse()), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Static assets or 404 fallback
    return new Response("Not found", { status: 404 });
  },
};

