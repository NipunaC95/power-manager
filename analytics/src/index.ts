import { Env, SyncedRecord } from './types';
import { AnalyticsEngine } from './analytics_engine';

/**
 * Cloudflare Worker for JK-BMS Advanced Analytics & Scheduled Data Pipeline
 */

export default {
  /**
   * 1. Scheduled Cron Trigger - Runs every hour within 1 hour automatically
   */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[CRON] Starting hourly sync for scheduled trigger at: ${new Date(controller.scheduledTime).toISOString()}`);
    ctx.waitUntil(syncDataAndRollup(env));
  },

  /**
   * 2. HTTP Fetch Handler - Analytical APIs & Static Dashboard Assets
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        },
      });
    }

    try {
      // ── GET /api/analytics/overview ──
      if (url.pathname === '/api/analytics/overview' && request.method === 'GET') {
        const overview = await getAnalyticsOverview(env);
        return jsonResponse(overview);
      }

      // ── GET /api/analytics/daily?days=30 ──
      if (url.pathname === '/api/analytics/daily' && request.method === 'GET') {
        const days = parseInt(url.searchParams.get('days') || '30', 10);
        const daily = await getDailyAnalytics(env, days);
        return jsonResponse(daily);
      }

      // ── GET /api/analytics/month?year=YYYY&month=M ──
      if (url.pathname === '/api/analytics/month' && request.method === 'GET') {
        const now = new Date();
        const year = parseInt(url.searchParams.get('year') || String(now.getFullYear()), 10);
        const month = parseInt(url.searchParams.get('month') || String(now.getMonth() + 1), 10);
        const monthly = await getMonthlyAnalytics(env, year, month);
        return jsonResponse(monthly);
      }

      // ── GET /api/analytics/hourly?date=YYYY-MM-DD ──
      if (url.pathname === '/api/analytics/hourly' && request.method === 'GET') {
        const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
        const hourly = await getHourlyAnalytics(env, date);
        return jsonResponse(hourly);
      }

      // ── GET /api/analytics/cells ──
      if (url.pathname === '/api/analytics/cells' && request.method === 'GET') {
        const cellHealth = await getCellHealthAnalysis(env);
        return jsonResponse(cellHealth);
      }

      // ── POST /api/analytics/sync (Manual Trigger) ──
      if (url.pathname === '/api/analytics/sync' && request.method === 'POST') {
        const result = await syncDataAndRollup(env);
        return jsonResponse(result);
      }

      // ── GET /api/sync/status ──
      if (url.pathname === '/api/sync/status' && request.method === 'GET') {
        const status = await getSyncStatus(env);
        return jsonResponse(status);
      }

      // ── Static Asset Serving (React Analytics UI) ──
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }

      return new Response('JK-BMS Analytics Worker Active', { status: 200 });
    } catch (err: any) {
      console.error('[API ERROR]', err);
      return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
    }
  },
};

// ── Data Sync & Rollup Pipeline ──────────────────────────────────────────────

async function syncDataAndRollup(env: Env): Promise<{
  success: boolean;
  syncedCount: number;
  lastSyncedId: number;
  message: string;
}> {
  let serverUrl = env.PRIMARY_SERVER_URL || 'http://136.80.228.184.sslip.io';
  // If raw IP is provided, convert to sslip.io to satisfy Cloudflare Worker DNS requirements
  if (/^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(serverUrl)) {
    serverUrl = serverUrl.replace(/^http:\/\/(\d+\.\d+\.\d+\.\d+)/, 'http://$1.sslip.io');
  }

  // Read sync cursor from D1
  const cursorRow = await env.DB.prepare(
    "SELECT value FROM sync_metadata WHERE key = 'last_synced_id'"
  ).first<{ value: string }>();

  const lastSyncedId = cursorRow ? parseInt(cursorRow.value, 10) : 0;

  // Set status to syncing
  await env.DB.prepare(
    "INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('sync_status', 'syncing', CURRENT_TIMESTAMP)"
  ).run();

  try {
    // Fetch batch from primary GCP server
    const fetchUrl = `${serverUrl}/api/sync/records?since_id=${lastSyncedId}&limit=1000`;
    console.log(`[SYNC] Fetching from primary server: ${fetchUrl}`);

    const res = await fetch(fetchUrl, {
      headers: {
        'Accept': 'application/json',
        ...(env.SYNC_API_KEY ? { 'X-API-Key': env.SYNC_API_KEY } : {}),
      },
      cf: { cacheTtl: 0 },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch from primary server: HTTP ${res.status}`);
    }

    const data: { count: number; since_id: number; last_id: number; records: SyncedRecord[] } = await res.json();
    const records = data.records || [];

    if (records.length === 0) {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('sync_status', 'idle', CURRENT_TIMESTAMP)"
      ).run();
      await env.DB.prepare(
        "INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('last_sync_time', datetime('now'), CURRENT_TIMESTAMP)"
      ).run();
      return { success: true, syncedCount: 0, lastSyncedId, message: 'Already up to date. No new records.' };
    }

    // Insert batch into D1 in chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const statements = chunk.map((r) =>
        env.DB.prepare(`
          INSERT OR REPLACE INTO bms_telemetry (
            server_id, timestamp, total_voltage, current, power, soc, capacity_remaining,
            cell_min_voltage, cell_max_voltage, cell_diff,
            temp_mos, temp_battery_1, temp_battery_2,
            charging_enabled, discharging_enabled, cell_voltages
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          r.id,
          r.timestamp,
          r.total_voltage,
          r.current,
          r.power,
          r.soc,
          r.capacity_remaining,
          r.cell_min_voltage,
          r.cell_max_voltage,
          r.cell_diff,
          r.temp_mos,
          r.temp_battery_1,
          r.temp_battery_2,
          r.charging_enabled,
          r.discharging_enabled,
          JSON.stringify(r.cell_voltages || [])
        )
      );
      await env.DB.batch(statements);
    }

    const newLastId = records[records.length - 1].id;

    // Update cursor
    await env.DB.prepare(
      "INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('last_synced_id', ?, CURRENT_TIMESTAMP)"
    ).bind(String(newLastId)).run();

    await env.DB.prepare(
      "INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('last_sync_time', datetime('now'), CURRENT_TIMESTAMP)"
    ).run();

    await env.DB.prepare(
      "INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('sync_status', 'idle', CURRENT_TIMESTAMP)"
    ).run();

    // Recompute rollups for affected dates
    await recomputeAnalyticsRollups(env, records);

    return {
      success: true,
      syncedCount: records.length,
      lastSyncedId: newLastId,
      message: `Successfully synced ${records.length} records. Last ID: ${newLastId}`,
    };
  } catch (err: any) {
    await env.DB.prepare(
      "INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('sync_status', 'error', CURRENT_TIMESTAMP)"
    ).run();
    throw err;
  }
}

// ── Analytical Aggregations ──────────────────────────────────────────────────

async function recomputeAnalyticsRollups(env: Env, records: SyncedRecord[]): Promise<void> {
  // Extract unique dates and hours affected
  const dates = new Set<string>();
  const hours = new Set<string>();

  for (const r of records) {
    const d = r.timestamp.substring(0, 10);
    const h = r.timestamp.substring(0, 13) + ':00:00';
    dates.add(d);
    hours.add(h);
  }

  const capacityAh = parseFloat(env.NOMINAL_CAPACITY_AH || '100');
  const nominalV = parseFloat(env.NOMINAL_VOLTAGE || '25.6');

  // Process Hourly Rollups
  for (const hour of hours) {
    const hourRows = await env.DB.prepare(`
      SELECT * FROM bms_telemetry WHERE timestamp >= ? AND timestamp < datetime(?, '+1 hour') ORDER BY timestamp ASC
    `).bind(hour, hour).all<any>();

    const rList = parseTelemetryRows(hourRows.results || []);
    if (!rList.length) continue;

    const energy = AnalyticsEngine.calculateEnergyThroughput(rList);
    const cellAnalysis = AnalyticsEngine.analyzeCellHealth(rList);

    const voltages = rList.map((r) => r.total_voltage);
    const currents = rList.map((r) => r.current);
    const socs = rList.map((r) => r.soc);

    const minV = Math.min(...voltages);
    const maxV = Math.max(...voltages);
    const avgV = Number((voltages.reduce((a, b) => a + b, 0) / voltages.length).toFixed(2));

    const avgI = Number((currents.reduce((a, b) => a + b, 0) / currents.length).toFixed(2));
    const peakChargeI = Number(Math.max(0, ...currents).toFixed(2));
    const peakDischargeI = Number(Math.abs(Math.min(0, ...currents)).toFixed(2));

    const avgSoc = Number((socs.reduce((a, b) => a + b, 0) / socs.length).toFixed(1));
    const minSoc = Math.min(...socs);
    const maxSoc = Math.max(...socs);

    const maxTempMos = Math.max(...rList.map((r) => r.temp_mos));
    const maxTempBat = Math.max(...rList.map((r) => Math.max(r.temp_battery_1, r.temp_battery_2)));

    const date = hour.substring(0, 10);

    await env.DB.prepare(`
      INSERT OR REPLACE INTO hourly_analytics (
        hour_bucket, date, record_count,
        kwh_charged, kwh_discharged, net_kwh,
        avg_voltage, min_voltage, max_voltage,
        avg_current, peak_charge_current, peak_discharge_current,
        avg_soc, min_soc, max_soc,
        max_cell_diff, avg_cell_diff, weakest_cell_index,
        max_temp_mos, max_temp_battery
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      hour, date, rList.length,
      energy.kwhCharged, energy.kwhDischarged, energy.netKwh,
      avgV, minV, maxV,
      avgI, peakChargeI, peakDischargeI,
      avgSoc, minSoc, maxSoc,
      cellAnalysis.maxPackDelta, cellAnalysis.avgPackDelta, cellAnalysis.weakestCellIndex,
      maxTempMos, maxTempBat
    ).run();
  }

  // Process Daily Rollups
  for (const date of dates) {
    const dayRows = await env.DB.prepare(`
      SELECT * FROM bms_telemetry WHERE timestamp >= ? AND timestamp < date(?, '+1 day') ORDER BY timestamp ASC
    `).bind(date, date).all<any>();

    const rList = parseTelemetryRows(dayRows.results || []);
    if (!rList.length) continue;

    const energy = AnalyticsEngine.calculateEnergyThroughput(rList);
    const cellAnalysis = AnalyticsEngine.analyzeCellHealth(rList);
    const cycles = AnalyticsEngine.calculateEquivalentCycles(energy.kwhDischarged, capacityAh, nominalV);

    const socs = rList.map((r) => r.soc);
    const minSoc = Math.min(...socs);
    const maxSoc = Math.max(...socs);
    const socSwing = maxSoc - minSoc;

    const powers = rList.map((r) => r.power);
    const peakChargeW = Number(Math.max(0, ...powers).toFixed(1));
    const peakDischargeW = Number(Math.abs(Math.min(0, ...powers)).toFixed(1));

    const highestTempMos = Math.max(...rList.map((r) => r.temp_mos));
    const highestTempBat = Math.max(...rList.map((r) => Math.max(r.temp_battery_1, r.temp_battery_2)));

    const coulombEff = energy.kwhCharged > 0 ? Number(((energy.kwhDischarged / energy.kwhCharged) * 100).toFixed(1)) : 100.0;
    const healthScore = AnalyticsEngine.calculateHealthScore(
      cellAnalysis.maxPackDelta,
      highestTempMos,
      highestTempBat,
      coulombEff
    );

    await env.DB.prepare(`
      INSERT OR REPLACE INTO daily_analytics (
        date, total_records,
        kwh_charged, kwh_discharged, net_kwh,
        coulomb_efficiency, equivalent_full_cycles,
        min_soc, max_soc, soc_swing,
        peak_charge_watts, peak_discharge_watts,
        max_cell_delta, weakest_cell_index,
        highest_temp_mos, highest_temp_bat,
        estimated_soh, health_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      date, rList.length,
      energy.kwhCharged, energy.kwhDischarged, energy.netKwh,
      coulombEff, cycles,
      minSoc, maxSoc, socSwing,
      peakChargeW, peakDischargeW,
      cellAnalysis.maxPackDelta, cellAnalysis.weakestCellIndex,
      highestTempMos, highestTempBat,
      100.0, healthScore
    ).run();
  }
}

// ── API Query Helpers ────────────────────────────────────────────────────────

async function getAnalyticsOverview(env: Env): Promise<any> {
  const totals = await env.DB.prepare(`
    SELECT 
      SUM(kwh_charged) as total_kwh_charged,
      SUM(kwh_discharged) as total_kwh_discharged,
      SUM(equivalent_full_cycles) as total_cycles,
      AVG(health_score) as avg_health_score,
      MAX(highest_temp_bat) as max_lifetime_temp_bat,
      COUNT(*) as total_days_tracked
    FROM daily_analytics
  `).first<any>();

  const today = new Date().toISOString().split('T')[0];
  const todayRow = await env.DB.prepare(`
    SELECT * FROM daily_analytics WHERE date = ?
  `).bind(today).first<any>();

  const latestTelemetry = await env.DB.prepare(`
    SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT 1
  `).first<any>();

  const syncStatus = await getSyncStatus(env);

  return {
    lifetime: {
      total_kwh_charged: Number((totals?.total_kwh_charged || 0).toFixed(2)),
      total_kwh_discharged: Number((totals?.total_kwh_discharged || 0).toFixed(2)),
      total_cycles: Number((totals?.total_cycles || 0).toFixed(2)),
      avg_health_score: Math.round(totals?.avg_health_score || 100),
      max_lifetime_temp_bat: totals?.max_lifetime_temp_bat || 0,
      total_days_tracked: totals?.total_days_tracked || 0,
    },
    today: todayRow || null,
    latest_telemetry: latestTelemetry ? {
      ...latestTelemetry,
      cell_voltages: JSON.parse(latestTelemetry.cell_voltages || '[]'),
    } : null,
    sync_status: syncStatus,
  };
}

async function getDailyAnalytics(env: Env, days: number): Promise<any[]> {
  const rows = await env.DB.prepare(`
    SELECT * FROM daily_analytics ORDER BY date DESC LIMIT ?
  `).bind(days).all();
  return (rows.results || []).reverse();
}

async function getMonthlyAnalytics(env: Env, year: number, month: number): Promise<any> {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const days = await env.DB.prepare(`
    SELECT * FROM daily_analytics WHERE date LIKE ? ORDER BY date ASC
  `).bind(`${monthStr}%`).all<any>();

  const rows = days.results || [];
  const totalDischarged = rows.reduce((sum, r) => sum + Number(r.kwh_discharged || 0), 0);
  const totalCharged = rows.reduce((sum, r) => sum + Number(r.kwh_charged || 0), 0);
  const totalCycles = rows.reduce((sum, r) => sum + Number(r.equivalent_full_cycles || 0), 0);
  const avgDailyUsage = rows.length > 0 ? totalDischarged / rows.length : 0;

  let peakDay: any = null;
  let maxDischarge = -1;
  for (const r of rows) {
    if (r.kwh_discharged > maxDischarge) {
      maxDischarge = r.kwh_discharged;
      peakDay = r;
    }
  }

  return {
    year,
    month,
    month_str: monthStr,
    summary: {
      total_kwh_discharged: Number(totalDischarged.toFixed(2)),
      total_kwh_charged: Number(totalCharged.toFixed(2)),
      net_kwh: Number((totalCharged - totalDischarged).toFixed(2)),
      total_cycles: Number(totalCycles.toFixed(2)),
      days_with_data: rows.length,
      avg_daily_kwh: Number(avgDailyUsage.toFixed(2)),
      peak_usage_day: peakDay ? { date: peakDay.date, kwh_discharged: peakDay.kwh_discharged } : null,
    },
    days: rows,
  };
}

async function getHourlyAnalytics(env: Env, date: string): Promise<any[]> {
  const rows = await env.DB.prepare(`
    SELECT * FROM hourly_analytics WHERE date = ? ORDER BY hour_bucket ASC
  `).bind(date).all();
  return rows.results || [];
}

async function getCellHealthAnalysis(env: Env): Promise<any> {
  // Use last 500 records for immediate health analysis
  const rows = await env.DB.prepare(`
    SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT 500
  `).all<any>();

  const records = parseTelemetryRows(rows.results || []).reverse();
  const analysis = AnalyticsEngine.analyzeCellHealth(records);

  return {
    sample_records: records.length,
    weakest_cell_index: analysis.weakestCellIndex,
    max_pack_delta: analysis.maxPackDelta,
    avg_pack_delta: analysis.avgPackDelta,
    cells: analysis.summaries,
  };
}

async function getSyncStatus(env: Env): Promise<any> {
  const rows = await env.DB.prepare(`
    SELECT key, value, updated_at FROM sync_metadata
  `).all<{ key: string; value: string; updated_at: string }>();

  const map: Record<string, any> = {};
  for (const r of rows.results || []) {
    map[r.key] = r.value;
  }
  return {
    last_synced_id: parseInt(map.last_synced_id || '0', 10),
    last_sync_time: map.last_sync_time || 'never',
    status: map.sync_status || 'idle',
    target_server: env.PRIMARY_SERVER_URL || 'http://136.80.228.184',
  };
}

function parseTelemetryRows(rows: any[]): SyncedRecord[] {
  return rows.map((r) => {
    let cells: number[] = [];
    try {
      cells = typeof r.cell_voltages === 'string' ? JSON.parse(r.cell_voltages) : (r.cell_voltages || []);
    } catch {
      cells = [];
    }
    return {
      id: r.id,
      timestamp: r.timestamp,
      total_voltage: Number(r.total_voltage),
      current: Number(r.current),
      power: Number(r.power),
      soc: Number(r.soc),
      capacity_remaining: Number(r.capacity_remaining),
      cell_min_voltage: r.cell_min_voltage != null ? Number(r.cell_min_voltage) : null,
      cell_max_voltage: r.cell_max_voltage != null ? Number(r.cell_max_voltage) : null,
      cell_diff: r.cell_diff != null ? Number(r.cell_diff) : null,
      temp_mos: Number(r.temp_mos),
      temp_battery_1: Number(r.temp_battery_1),
      temp_battery_2: Number(r.temp_battery_2),
      charging_enabled: Number(r.charging_enabled),
      discharging_enabled: Number(r.discharging_enabled),
      cell_voltages: cells,
    };
  });
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}
