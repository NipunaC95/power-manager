export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ── POST /api/telemetry — ingest from ESP32 ────────────
    if (url.pathname === "/api/telemetry" && request.method === "POST") {
      const apiKey = request.headers.get("X-API-Key");
      if (env.API_KEY && apiKey !== env.API_KEY) {
        return json({ error: "Unauthorized" }, 401);
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

        // 1) Insert pack-level telemetry (no derived columns)
        const result = await env.DB.prepare(`
          INSERT INTO bms_telemetry
          (total_voltage, current, soc, capacity_remaining,
            temp_mos, temp_battery_1, temp_battery_2,
            charging_enabled, discharging_enabled)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
          total_voltage, current, soc, capacity_remaining,
          temp_mos, temp_battery_1, temp_battery_2,
          charging_enabled, discharging_enabled
        ).run();

        // 2) Get the inserted row id
        const row = await env.DB.prepare("SELECT last_insert_rowid() as id").first();
        const telemetryId = row?.id;

        // 3) Insert individual cell voltages
        const cells = Array.isArray(cell_voltages) ? cell_voltages : [];
        if (telemetryId && cells.length > 0) {
          // Batch insert via D1 batch API for efficiency
          const stmts = cells.map((v, i) =>
            env.DB.prepare(
              "INSERT INTO cell_data (telemetry_id, cell_index, voltage) VALUES (?, ?, ?)"
            ).bind(telemetryId, i, Number(v))
          );
          await env.DB.batch(stmts);
        }

        return json({ success: true, id: telemetryId });
      } catch (err) {
        return json({ error: err.message }, 400);
      }
    }

    // ── GET /api/latest — most recent reading with cells ───
    if (url.pathname === "/api/latest" && request.method === "GET") {
      const t = await env.DB.prepare(
        "SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT 1"
      ).first();

      if (!t) return json({});

      // Fetch cell voltages for this reading
      const cellRows = await env.DB.prepare(
        "SELECT cell_index, voltage FROM cell_data WHERE telemetry_id = ? ORDER BY cell_index"
      ).bind(t.id).all();

      const cells = (cellRows.results || []).map((r) => r.voltage);

      // Compute derived values
      const power = t.total_voltage * t.current;
      const cell_min = cells.length ? Math.min(...cells) : null;
      const cell_max = cells.length ? Math.max(...cells) : null;
      const cell_diff = cell_min != null ? cell_max - cell_min : null;

      return json({
        ...t,
        power,
        cell_voltages: cells,
        cell_min_voltage: cell_min,
        cell_max_voltage: cell_max,
        cell_diff,
      });
    }

    // ── GET /api/history — recent readings (pack-level) ────
    if (url.pathname === "/api/history" && request.method === "GET") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

      const results = await env.DB.prepare(
        "SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT ?"
      ).bind(limit).all();

      const rows = (results.results || []).reverse().map((t) => ({
        ...t,
        power: t.total_voltage * t.current,
      }));

      return json(rows);
    }

    // ── GET /api/cells?cell=0&limit=100 — single cell history ──
    if (url.pathname === "/api/cells" && request.method === "GET") {
      const cellIndex = parseInt(url.searchParams.get("cell") ?? "0");
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "200"), 1000);

      const results = await env.DB.prepare(`
        SELECT c.voltage, c.cell_index, t.timestamp, t.id as telemetry_id
        FROM cell_data c
        JOIN bms_telemetry t ON t.id = c.telemetry_id
        WHERE c.cell_index = ?
          ORDER BY t.timestamp DESC
        LIMIT ?
            `).bind(cellIndex, limit).all();

      return json((results.results || []).reverse());
    }

    // ── GET /api/cells/latest — all cells from the latest N readings ──
    if (url.pathname === "/api/cells/latest" && request.method === "GET") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);

      const results = await env.DB.prepare(`
        SELECT c.cell_index, c.voltage, t.timestamp, t.id as telemetry_id
        FROM cell_data c
        JOIN bms_telemetry t ON t.id = c.telemetry_id
        WHERE t.id IN(
              SELECT id FROM bms_telemetry ORDER BY timestamp DESC LIMIT ?
        )
        ORDER BY t.timestamp ASC, c.cell_index ASC
          `).bind(limit).all();

      return json(results.results || []);
    }

    // ── Serve static frontend ──────────────────────────────
    return env.ASSETS.fetch(request);
  },
};
