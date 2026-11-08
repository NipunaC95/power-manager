/**
 * JK-BMS Dashboard & Query Worker ("jkbms-dashboard")
 *
 * Dedicated worker for:
 * 1. Serving read-only telemetry queries from Cloudflare D1
 * 2. Realtime WebSocket streaming to the React dashboard (/api/ws, /ws)
 * 3. Serving the React web application static assets
 */

// ── Database Query Helpers ────────────────────────────────────

async function getLatestTelemetry(env) {
  const t = await env.DB.prepare(
    "SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT 1"
  ).first();

  if (!t) return null;

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

  return {
    ...t,
    power,
    cell_voltages: cells,
    cell_min_voltage: cell_min,
    cell_max_voltage: cell_max,
    cell_diff,
  };
}

async function getHistoryTelemetry(env, limit = 100) {
  const boundedLimit = Math.min(limit, 500);
  const results = await env.DB.prepare(
    "SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT ?"
  ).bind(boundedLimit).all();

  return (results.results || []).reverse().map((t) => {
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
}

// ── WebSocket Session Handler ─────────────────────────────────

function handleWebSocketSession(server, env) {
  let isAlive = true;
  let interval = null;
  let heartbeat = null;
  let lastTimestamp = null;

  const send = (obj) => {
    if (!isAlive) return;
    try {
      server.send(JSON.stringify(obj));
    } catch (e) {
      cleanup();
    }
  };

  const cleanup = () => {
    isAlive = false;
    if (interval) clearInterval(interval);
    if (heartbeat) clearInterval(heartbeat);
  };

  const pushLatestAndHistory = async () => {
    try {
      const [latest, history] = await Promise.all([
        getLatestTelemetry(env),
        getHistoryTelemetry(env, 100),
      ]);
      if (latest?.timestamp) {
        lastTimestamp = latest.timestamp;
      }
      send({ type: "init", latest, history });
    } catch (err) {
      console.error("WS init push error:", err);
    }
  };

  const checkTelemetryUpdate = async () => {
    if (!isAlive) return;
    try {
      const latest = await getLatestTelemetry(env);
      if (latest && latest.timestamp !== lastTimestamp) {
        lastTimestamp = latest.timestamp;
        send({ type: "telemetry", latest });
      }
    } catch (err) {
      // transient read error
    }
  };

  server.addEventListener("message", async (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "ping") {
        send({ type: "pong" });
      } else if (data.type === "refresh") {
        await pushLatestAndHistory();
      }
    } catch (e) {}
  });

  server.addEventListener("close", () => {
    cleanup();
  });

  server.addEventListener("error", () => {
    cleanup();
  });

  // Push initial data
  pushLatestAndHistory();

  // Poll database for fresh telemetry updates every 2s
  interval = setInterval(checkTelemetryUpdate, 2000);

  // Keep connection alive every 25s
  heartbeat = setInterval(() => {
    send({ type: "ping" });
  }, 25000);
}

// ── Worker Fetch Handler ──────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── WebSocket Upgrade (/api/ws or /ws) ───────────────────
    if (url.pathname === "/api/ws" || url.pathname === "/ws") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }

      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      server.accept();
      handleWebSocketSession(server, env);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // CORS headers for HTTP
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    // ── GET /api/latest ─────────────────────────────────────
    if (url.pathname === "/api/latest" && request.method === "GET") {
      const latest = await getLatestTelemetry(env);
      return json(latest || {});
    }

    // ── GET /api/history ────────────────────────────────────
    if (url.pathname === "/api/history" && request.method === "GET") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
      const history = await getHistoryTelemetry(env, limit);
      return json(history);
    }

    // ── GET /api/cells?cell=0&limit=200 ─────────────────────
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

    // ── GET /api/cells/latest ───────────────────────────────
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

    // ── GET /api/settings ───────────────────────────────────
    if (url.pathname === "/api/settings" && request.method === "GET") {
      const row = await env.DB.prepare(
        "SELECT * FROM bms_settings WHERE id = 1"
      ).first();

      if (row) {
        return json({
          batteryCapacityAh: row.battery_capacity_ah,
          enableManualSoc: row.enable_manual_soc === 1,
          socMethod: row.soc_method,
          vMin: row.v_min,
          vMax: row.v_max,
          sohOverride: row.soh_override != null ? row.soh_override : 100,
          updatedAt: row.updated_at,
        });
      }

      return json({
        batteryCapacityAh: 100,
        enableManualSoc: false,
        socMethod: "lifepo4_curve",
        vMin: 24.0,
        vMax: 27.2,
        sohOverride: 100,
      });
    }

    // ── POST /api/settings ──────────────────────────────────
    if (url.pathname === "/api/settings" && request.method === "POST") {
      try {
        const body = await request.json();
        const batteryCapacityAh = Number(body.batteryCapacityAh) || 100;
        const enableManualSoc = body.enableManualSoc ? 1 : 0;
        const socMethod = String(body.socMethod || "lifepo4_curve");
        const vMin = Number(body.vMin) || 24.0;
        const vMax = Number(body.vMax) || 27.2;
        const sohOverride = Number(body.sohOverride) > 0 ? Number(body.sohOverride) : 100;

        await env.DB.prepare(`
          INSERT INTO bms_settings (id, battery_capacity_ah, enable_manual_soc, soc_method, v_min, v_max, soh_override, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            battery_capacity_ah = excluded.battery_capacity_ah,
            enable_manual_soc = excluded.enable_manual_soc,
            soc_method = excluded.soc_method,
            v_min = excluded.v_min,
            v_max = excluded.v_max,
            soh_override = excluded.soh_override,
            updated_at = CURRENT_TIMESTAMP;
        `).bind(batteryCapacityAh, enableManualSoc, socMethod, vMin, vMax, sohOverride).run();

        return json({
          success: true,
          settings: {
            batteryCapacityAh,
            enableManualSoc: enableManualSoc === 1,
            socMethod,
            vMin,
            vMax,
            sohOverride,
          },
        });
      } catch (err) {
        return json({ error: err.message }, 400);
      }
    }

    // ── Serve static frontend ───────────────────────────────
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
