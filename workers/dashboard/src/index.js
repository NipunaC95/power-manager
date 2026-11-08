/**
 * JK-BMS Dashboard & Query Worker ("jkbms-dashboard")
 *
 * Dedicated worker for:
 * 1. Serving read-only telemetry queries from Cloudflare D1
 * 2. Serving the React web application static assets
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ── GET /api/latest — most recent reading + cells ───────
    if (url.pathname === "/api/latest" && request.method === "GET") {
      const t = await env.DB.prepare(
        "SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT 1"
      ).first();

      if (!t) return json({});

      // 1. Try fetching from cell_data table
      const cellRows = await env.DB.prepare(
        "SELECT cell_index, voltage FROM cell_data WHERE telemetry_id = ? ORDER BY cell_index"
      ).bind(t.id).all();

      let cells = (cellRows.results || []).map((r) => r.voltage);

      // Fallback for legacy rows where cells were stored in cell_voltages string
      if (cells.length === 0 && t.cell_voltages) {
        try {
          cells = JSON.parse(t.cell_voltages);
        } catch {
          cells = [];
        }
      }

      // Compute derived values dynamically
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

    // ── GET /api/history — recent readings ──────────────────
    if (url.pathname === "/api/history" && request.method === "GET") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

      const results = await env.DB.prepare(
        "SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT ?"
      ).bind(limit).all();

      const rows = (results.results || []).reverse().map((t) => {
        let cells = [];
        if (t.cell_voltages) {
          try {
            cells = JSON.parse(t.cell_voltages);
          } catch {
            cells = [];
          }
        }
        return {
          ...t,
          power: t.total_voltage * t.current,
          cell_voltages: cells,
        };
      });

      return json(rows);
    }

    // ── GET /api/cells?cell=0&limit=200 — single cell history ─
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

    // ── GET /api/cells/latest — all cells across recent readings
    if (url.pathname === "/api/cells/latest" && request.method === "GET") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);

      const results = await env.DB.prepare(`
        SELECT c.cell_index, c.voltage, t.timestamp, t.id as telemetry_id
        FROM cell_data c
        JOIN bms_telemetry t ON t.id = c.telemetry_id
        WHERE t.id IN (
          SELECT id FROM bms_telemetry ORDER BY timestamp DESC LIMIT ?
        )
        ORDER BY t.timestamp ASC, c.cell_index ASC
      `).bind(limit).all();

      return json(results.results || []);
    }

    // ── Serve static frontend ──────────────────────────────
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

