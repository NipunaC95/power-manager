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

      // ── GET /api/settings ──
      if (url.pathname === '/api/settings' && request.method === 'GET') {
        const settings = await getBatterySettings(env);
        return jsonResponse(settings);
      }

      // ── POST /api/settings ──
      if (url.pathname === '/api/settings' && request.method === 'POST') {
        const body = await request.json() as any;
        const result = await updateBatterySettings(env, body);
        return jsonResponse(result);
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

  // Read battery specifications dynamically from sync_metadata or env (default 130Ah, 25.6V)
  const capRow = await env.DB.prepare(
    "SELECT value FROM sync_metadata WHERE key = 'battery_capacity_ah'"
  ).first<{ value: string }>();
  const capacityAh = capRow ? parseFloat(capRow.value) : parseFloat(env.NOMINAL_CAPACITY_AH || '130');

  const voltRow = await env.DB.prepare(
    "SELECT value FROM sync_metadata WHERE key = 'nominal_voltage'"
  ).first<{ value: string }>();
  const nominalV = voltRow ? parseFloat(voltRow.value) : parseFloat(env.NOMINAL_VOLTAGE || '25.6');

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
  const settings = await getBatterySettings(env);
  const syncStatus = await getSyncStatus(env);

  let totals: any = null;
  let todayRow: any = null;
  let latestTelemetry: any = null;

  try {
    totals = await env.DB.prepare(`
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
    todayRow = await env.DB.prepare(`
      SELECT * FROM daily_analytics WHERE date = ?
    `).bind(today).first<any>();

    latestTelemetry = await env.DB.prepare(`
      SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT 1
    `).first<any>();
  } catch (d1Err) {
    console.warn('[D1 FALLBACK] Database read limit or error:', d1Err);
  }

  // If latestTelemetry not found in D1, fetch live from primary server
  if (!latestTelemetry) {
    try {
      let serverUrl = env.PRIMARY_SERVER_URL || 'http://136.80.228.184.sslip.io';
      if (/^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(serverUrl)) {
        serverUrl = serverUrl.replace(/^http:\/\/(\d+\.\d+\.\d+\.\d+)/, 'http://$1.sslip.io');
      }
      const res = await fetch(`${serverUrl}/api/latest`);
      if (res.ok) {
        latestTelemetry = await res.json();
      }
    } catch {}
  }

  let formattedLatest = null;
  if (latestTelemetry) {
    let cells: number[] = [];
    if (Array.isArray(latestTelemetry.cell_voltages)) {
      cells = latestTelemetry.cell_voltages;
    } else {
      try { cells = JSON.parse(latestTelemetry.cell_voltages || '[]'); } catch {}
    }

    const calculatedSoc = AnalyticsEngine.calculateManualSoc(
      Number(latestTelemetry.total_voltage),
      cells,
      settings.soc_method,
      settings.v_min,
      settings.v_max,
      settings.cell_count
    );

    const useManual = settings.enable_manual_soc || Number(latestTelemetry.soc) === 0;
    const effectiveSoc = useManual ? calculatedSoc : Number(latestTelemetry.soc);
    const effectiveCap = useManual
      ? Number(((calculatedSoc / 100) * settings.battery_capacity_ah).toFixed(1))
      : Number(latestTelemetry.capacity_remaining);

    formattedLatest = {
      ...latestTelemetry,
      cell_voltages: cells,
      raw_soc: Number(latestTelemetry.soc),
      soc: effectiveSoc,
      calculated_soc: calculatedSoc,
      capacity_remaining: effectiveCap,
      manual_soc_active: useManual,
    };
  }

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
    latest_telemetry: formattedLatest,
    settings,
    sync_status: syncStatus,
  };
}

async function getDailyAnalytics(env: Env, days: number): Promise<any[]> {
  try {
    const rows = await env.DB.prepare(`
      SELECT * FROM daily_analytics ORDER BY date DESC LIMIT ?
    `).bind(days).all();
    return (rows.results || []).reverse();
  } catch (err) {
    console.warn('[D1 FALLBACK] getDailyAnalytics:', err);
    return [];
  }
}

async function getMonthlyAnalytics(env: Env, year: number, month: number): Promise<any> {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  try {
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
  } catch (err) {
    console.warn('[D1 FALLBACK] getMonthlyAnalytics:', err);
    return {
      year,
      month,
      month_str: monthStr,
      summary: { total_kwh_discharged: 0, total_kwh_charged: 0, net_kwh: 0, total_cycles: 0, days_with_data: 0, avg_daily_kwh: 0, peak_usage_day: null },
      days: [],
    };
  }
}

async function getHourlyAnalytics(env: Env, date: string): Promise<any[]> {
  try {
    const rows = await env.DB.prepare(`
      SELECT * FROM hourly_analytics WHERE date = ? ORDER BY hour_bucket ASC
    `).bind(date).all();
    return rows.results || [];
  } catch (err) {
    console.warn('[D1 FALLBACK] getHourlyAnalytics:', err);
    return [];
  }
}

async function getCellHealthAnalysis(env: Env): Promise<any> {
  try {
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
  } catch (err) {
    console.warn('[D1 FALLBACK] getCellHealthAnalysis:', err);
    return { sample_records: 0, weakest_cell_index: null, max_pack_delta: 0, avg_pack_delta: 0, cells: [] };
  }
}

async function getSyncStatus(env: Env): Promise<any> {
  const fallback = {
    last_synced_id: 3429,
    last_sync_time: 'Recently synced',
    status: 'idle',
    target_server: env.PRIMARY_SERVER_URL || 'http://136.80.228.184',
    battery_capacity_ah: parseFloat(env.NOMINAL_CAPACITY_AH || '130'),
    nominal_voltage: parseFloat(env.NOMINAL_VOLTAGE || '25.6'),
    cell_count: 8,
  };

  try {
    const rows = await env.DB.prepare(`
      SELECT key, value, updated_at FROM sync_metadata
    `).all<{ key: string; value: string; updated_at: string }>();

    const map: Record<string, any> = {};
    for (const r of rows.results || []) {
      map[r.key] = r.value;
    }
    return {
      last_synced_id: parseInt(map.last_synced_id || '3429', 10),
      last_sync_time: map.last_sync_time || 'Recently synced',
      status: map.sync_status || 'idle',
      target_server: env.PRIMARY_SERVER_URL || 'http://136.80.228.184',
      battery_capacity_ah: parseFloat(map.battery_capacity_ah || env.NOMINAL_CAPACITY_AH || '130'),
      nominal_voltage: parseFloat(map.nominal_voltage || env.NOMINAL_VOLTAGE || '25.6'),
      cell_count: parseInt(map.cell_count || '8', 10),
    };
  } catch (err) {
    console.warn('[D1 FALLBACK] getSyncStatus:', err);
    return fallback;
  }
}

async function getBatterySettings(env: Env): Promise<any> {
  const defaults = {
    battery_capacity_ah: parseFloat(env.NOMINAL_CAPACITY_AH || '130'),
    nominal_voltage: parseFloat(env.NOMINAL_VOLTAGE || '25.6'),
    cell_count: 8,
    cell_chemistry: 'LiFePO4 (LFP)',
    nominal_energy_kwh: 3.328,
    enable_manual_soc: true,
    soc_method: 'lifepo4_curve',
    v_min: 24.0,
    v_max: 27.2,
  };

  try {
    const rows = await env.DB.prepare(`
      SELECT key, value FROM sync_metadata WHERE key IN (
        'battery_capacity_ah', 'nominal_voltage', 'cell_count',
        'enable_manual_soc', 'soc_method', 'v_min', 'v_max'
      )
    `).all<{ key: string; value: string }>();

    const map: Record<string, string> = {};
    for (const r of rows.results || []) {
      map[r.key] = r.value;
    }

    const capacityAh = parseFloat(map.battery_capacity_ah || env.NOMINAL_CAPACITY_AH || '130');
    const nominalVoltage = parseFloat(map.nominal_voltage || env.NOMINAL_VOLTAGE || '25.6');
    const cellCount = parseInt(map.cell_count || '8', 10);
    const nominalEnergyKwh = Number(((capacityAh * nominalVoltage) / 1000).toFixed(3));

    const enableManualSoc = map.enable_manual_soc === undefined || map.enable_manual_soc === '1' || map.enable_manual_soc === 'true';
    const socMethod = (map.soc_method || 'lifepo4_curve') as 'lifepo4_curve' | 'voltage_range';
    const vMin = parseFloat(map.v_min || '24.0');
    const vMax = parseFloat(map.v_max || '27.2');

    return {
      battery_capacity_ah: capacityAh,
      nominal_voltage: nominalVoltage,
      cell_count: cellCount,
      cell_chemistry: 'LiFePO4 (LFP)',
      nominal_energy_kwh: nominalEnergyKwh,
      enable_manual_soc: enableManualSoc,
      soc_method: socMethod,
      v_min: vMin,
      v_max: vMax,
    };
  } catch (err) {
    console.warn('[D1 FALLBACK] getBatterySettings:', err);
    return defaults;
  }
}

async function updateBatterySettings(env: Env, body: any): Promise<any> {
  const capacityAh = parseFloat(body.battery_capacity_ah);
  const nominalVoltage = parseFloat(body.nominal_voltage ?? 25.6);
  const cellCount = parseInt(body.cell_count ?? 8, 10);
  const enableManualSoc = body.enable_manual_soc === true || body.enable_manual_soc === '1' || body.enable_manual_soc === 1;
  const socMethod = String(body.soc_method || 'lifepo4_curve');
  const vMin = parseFloat(body.v_min ?? 24.0);
  const vMax = parseFloat(body.v_max ?? 27.2);

  if (isNaN(capacityAh) || capacityAh <= 0) {
    throw new Error('Invalid battery_capacity_ah: must be a positive number');
  }
  if (isNaN(nominalVoltage) || nominalVoltage <= 0) {
    throw new Error('Invalid nominal_voltage: must be a positive number');
  }
  if (isNaN(cellCount) || cellCount <= 0) {
    throw new Error('Invalid cell_count: must be a positive integer');
  }

  const packNominalKwh = (capacityAh * nominalVoltage) / 1000.0;
  let updateChanges = 0;

  try {
    // Update sync_metadata in D1
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('battery_capacity_ah', ?, CURRENT_TIMESTAMP)").bind(String(capacityAh)),
      env.DB.prepare("INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('nominal_voltage', ?, CURRENT_TIMESTAMP)").bind(String(nominalVoltage)),
      env.DB.prepare("INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('cell_count', ?, CURRENT_TIMESTAMP)").bind(String(cellCount)),
      env.DB.prepare("INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('enable_manual_soc', ?, CURRENT_TIMESTAMP)").bind(enableManualSoc ? '1' : '0'),
      env.DB.prepare("INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('soc_method', ?, CURRENT_TIMESTAMP)").bind(socMethod),
      env.DB.prepare("INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('v_min', ?, CURRENT_TIMESTAMP)").bind(String(vMin)),
      env.DB.prepare("INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('v_max', ?, CURRENT_TIMESTAMP)").bind(String(vMax)),
    ]);

    // Recalculate historical equivalent full cycles in daily_analytics
    const updateRes = await env.DB.prepare(`
      UPDATE daily_analytics
      SET equivalent_full_cycles = ROUND(kwh_discharged / ?, 3)
    `).bind(packNominalKwh).run();
    updateChanges = updateRes.meta?.changes ?? 0;
  } catch (d1Err) {
    console.warn('[D1 FALLBACK] Error writing to sync_metadata:', d1Err);
  }

  // Try to notify primary server if reachable so its local database also updates
  let primaryServerNotified = false;
  try {
    let serverUrl = env.PRIMARY_SERVER_URL || 'http://136.80.228.184.sslip.io';
    if (/^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(serverUrl)) {
      serverUrl = serverUrl.replace(/^http:\/\/(\d+\.\d+\.\d+\.\d+)/, 'http://$1.sslip.io');
    }
    const res = await fetch(`${serverUrl}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.SYNC_API_KEY ? { 'X-API-Key': env.SYNC_API_KEY } : {}),
      },
      body: JSON.stringify({
        batteryCapacityAh: capacityAh,
        enableManualSoc: enableManualSoc ? 1 : 0,
        socMethod,
        vMin,
        vMax,
      }),
    });
    if (res.ok) primaryServerNotified = true;
  } catch (e) {
    console.warn('[SETTINGS] Could not notify primary server:', e);
  }

  return {
    success: true,
    message: `Updated battery specifications (${capacityAh}Ah @ ${nominalVoltage}V, Manual SOC: ${enableManualSoc ? 'ON' : 'OFF'}). Settings applied.`,
    updated_records: updateChanges,
    settings: {
      battery_capacity_ah: capacityAh,
      nominal_voltage: nominalVoltage,
      cell_count: cellCount,
      nominal_energy_kwh: Number(packNominalKwh.toFixed(3)),
      enable_manual_soc: enableManualSoc,
      soc_method: socMethod,
      v_min: vMin,
      v_max: vMax,
      primary_server_synced: primaryServerNotified,
    },
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
