import React, { useState, useEffect } from 'react';

interface AnalyticsOverview {
  lifetime: {
    total_kwh_charged: number;
    total_kwh_discharged: number;
    total_cycles: number;
    avg_health_score: number;
    max_lifetime_temp_bat: number;
    total_days_tracked: number;
  };
  today: {
    date: string;
    kwh_charged: number;
    kwh_discharged: number;
    net_kwh: number;
    coulomb_efficiency: number;
    equivalent_full_cycles: number;
    min_soc: number;
    max_soc: number;
    soc_swing: number;
    peak_charge_watts: number;
    peak_discharge_watts: number;
    max_cell_delta: number;
    weakest_cell_index: number | null;
    highest_temp_mos: number;
    highest_temp_bat: number;
    health_score: number;
  } | null;
  sync_status: {
    last_synced_id: number;
    last_sync_time: string;
    status: string;
    target_server: string;
  };
}

interface DailyRow {
  date: string;
  kwh_charged: number;
  kwh_discharged: number;
  net_kwh: number;
  equivalent_full_cycles: number;
  max_cell_delta: number;
  weakest_cell_index: number | null;
  highest_temp_mos: number;
  highest_temp_bat: number;
  health_score: number;
}

interface CellHealth {
  sample_records: number;
  weakest_cell_index: number | null;
  max_pack_delta: number;
  avg_pack_delta: number;
  cells: Array<{
    cell_index: number;
    avg_voltage: number;
    min_voltage: number;
    max_voltage: number;
    avg_delta_from_mean: number;
    voltage_spread: number;
    is_weakest: boolean;
    status: 'healthy' | 'caution' | 'imbalanced';
  }>;
}

export default function App() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [dailyData, setDailyData] = useState<DailyRow[]>([]);
  const [cellHealth, setCellHealth] = useState<CellHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [ovRes, dailyRes, cellsRes] = await Promise.all([
        fetch('/api/analytics/overview').then((r) => r.json()),
        fetch('/api/analytics/daily?days=14').then((r) => r.json()),
        fetch('/api/analytics/cells').then((r) => r.json()),
      ]);
      setOverview(ovRes);
      setDailyData(Array.isArray(dailyRes) ? dailyRes : []);
      setCellHealth(cellsRes);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncMessage('Syncing with primary GCP server...');
    try {
      const res = await fetch('/api/analytics/sync', { method: 'POST' });
      const data = await res.json();
      setSyncMessage(data.message || 'Sync completed successfully!');
      await fetchData();
    } catch (err: any) {
      setSyncMessage(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const maxKwh = Math.max(
    ...dailyData.map((d) => Math.max(d.kwh_charged, d.kwh_discharged)),
    1.0
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* ── Top Header ── */}
      <header className="border-b border-white/10 pb-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-[#BF3C27] text-white font-mono text-sm font-bold shadow-md">
              A
            </span>
            <h1 className="font-serif text-2xl md:text-3xl text-white font-normal tracking-tight">
              JK-BMS <span className="italic text-neutral-400 font-serif font-light text-lg md:text-xl">Advanced Analytics</span>
            </h1>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-mono tracking-wider">
              CLOUDFLARE D1
            </span>
          </div>
          <p className="font-mono text-xs text-neutral-400 mt-1 flex items-center gap-2">
            <span>Serverless Edge Pipeline</span>
            <span className="text-neutral-600">•</span>
            <span>Hourly Scheduled Rollups</span>
          </p>
        </div>

        {/* Sync Actions & Links */}
        <div className="flex items-center gap-3">
          <a
            href="http://136.80.228.184/"
            target="_blank"
            rel="noreferrer"
            className="zed-btn-neutral px-3 py-1.5 rounded-lg text-xs font-mono text-neutral-300 transition flex items-center gap-1.5"
            title="Open Live Monitor"
          >
            <span>⚡</span>
            <span>Live Monitor</span>
          </a>

          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="zed-btn-rust px-4 py-1.5 rounded-lg text-xs font-mono text-white transition flex items-center gap-2 shadow disabled:opacity-50 cursor-pointer"
          >
            <span className={isSyncing ? 'animate-spin' : ''}>🔄</span>
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>
      </header>

      {/* Sync Status Banner */}
      {syncMessage && (
        <div className="mb-6 p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 font-mono text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{syncMessage}</span>
          </div>
          <button onClick={() => setSyncMessage(null)} className="text-neutral-400 hover:text-white">✕</button>
        </div>
      )}

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Total Energy Discharged */}
        <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-mono">ENERGY DELIVERED</span>
            <span className="text-amber-400 text-sm">⚡</span>
          </div>
          <div className="text-2xl font-mono text-white font-medium">
            {overview?.lifetime.total_kwh_discharged ?? '--'} <span className="text-sm font-normal text-neutral-400">kWh</span>
          </div>
          <p className="text-[11px] text-neutral-500 font-mono mt-2">
            Today: {overview?.today?.kwh_discharged ?? '0.00'} kWh
          </p>
        </div>

        {/* Total Energy Charged */}
        <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-mono">ENERGY CHARGED</span>
            <span className="text-emerald-400 text-sm">🔌</span>
          </div>
          <div className="text-2xl font-mono text-white font-medium">
            {overview?.lifetime.total_kwh_charged ?? '--'} <span className="text-sm font-normal text-neutral-400">kWh</span>
          </div>
          <p className="text-[11px] text-neutral-500 font-mono mt-2">
            Coulomb Efficiency: {overview?.today?.coulomb_efficiency ?? 100}%
          </p>
        </div>

        {/* Equivalent Full Cycles */}
        <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-mono">BATTERY CYCLES</span>
            <span className="text-blue-400 text-sm">🔄</span>
          </div>
          <div className="text-2xl font-mono text-white font-medium">
            {overview?.lifetime.total_cycles ?? '--'} <span className="text-sm font-normal text-neutral-400">EFC</span>
          </div>
          <p className="text-[11px] text-neutral-500 font-mono mt-2">
            Equivalent Full Cycles (100Ah @ 25.6V)
          </p>
        </div>

        {/* Health Score */}
        <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-mono">HEALTH SCORE</span>
            <span className="text-emerald-400 text-sm">🛡️</span>
          </div>
          <div className="text-2xl font-mono text-emerald-400 font-medium">
            {overview?.lifetime.avg_health_score ?? 100}%
          </div>
          <p className="text-[11px] text-neutral-500 font-mono mt-2">
            Max Cell Δ: {cellHealth ? `${(cellHealth.max_pack_delta * 1000).toFixed(0)} mV` : '--'}
          </p>
        </div>
      </div>

      {/* ── Daily Energy Throughput Chart ── */}
      <section className="bg-[#1e1e22] border border-white/10 rounded-xl p-6 mb-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-serif text-lg text-white font-normal">Daily Energy Throughput</h2>
            <p className="text-xs text-neutral-400 font-mono">Charged (kWh) vs Discharged (kWh) over past 14 days</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> Charged
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2.5 h-2.5 rounded bg-amber-500"></span> Discharged
            </span>
          </div>
        </div>

        {dailyData.length === 0 ? (
          <div className="py-12 text-center text-neutral-500 font-mono text-xs">
            No daily rollup data yet. Click &quot;Sync Now&quot; to aggregate telemetry from your primary server.
          </div>
        ) : (
          <div className="h-48 flex items-end gap-3 pt-6 border-b border-white/10">
            {dailyData.map((d) => {
              const chgPct = (d.kwh_charged / maxKwh) * 100;
              const disPct = (d.kwh_discharged / maxKwh) * 100;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                  {/* Tooltip */}
                  <div className="absolute -top-14 opacity-0 group-hover:opacity-100 transition bg-neutral-900 border border-white/20 p-2 rounded text-[10px] font-mono text-white pointer-events-none whitespace-nowrap z-10 shadow-lg">
                    <p className="font-bold text-neutral-300">{d.date}</p>
                    <p className="text-emerald-400">In: {d.kwh_charged.toFixed(2)} kWh</p>
                    <p className="text-amber-400">Out: {d.kwh_discharged.toFixed(2)} kWh</p>
                  </div>

                  <div className="w-full flex items-end justify-center gap-1 h-full">
                    {/* Charged Bar */}
                    <div
                      style={{ height: `${Math.max(chgPct, 4)}%` }}
                      className="w-1/2 bg-emerald-500/80 hover:bg-emerald-400 rounded-t transition"
                    />
                    {/* Discharged Bar */}
                    <div
                      style={{ height: `${Math.max(disPct, 4)}%` }}
                      className="w-1/2 bg-amber-500/80 hover:bg-amber-400 rounded-t transition"
                    />
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono mt-2 truncate w-full text-center">
                    {d.date.substring(5)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Cell Balance & Weakest Cell Matrix ── */}
      <section className="bg-[#1e1e22] border border-white/10 rounded-xl p-6 mb-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h2 className="font-serif text-lg text-white font-normal">Cell Balance & Degradation Analysis</h2>
            <p className="text-xs text-neutral-400 font-mono">
              Individual cell voltage sag analysis under load & divergence detection
            </p>
          </div>
          {cellHealth?.weakest_cell_index !== null && cellHealth?.weakest_cell_index !== undefined && (
            <div className="bg-amber-950/40 border border-amber-500/30 text-amber-300 px-3 py-1 rounded text-xs font-mono flex items-center gap-2">
              <span>⚠️ Weakest: Cell #{cellHealth.weakest_cell_index + 1}</span>
            </div>
          )}
        </div>

        {(!cellHealth || !cellHealth.cells.length) ? (
          <div className="py-8 text-center text-neutral-500 font-mono text-xs">
            Loading cell balance metrics...
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
            {cellHealth.cells.map((c) => (
              <div
                key={c.cell_index}
                className={`p-3 rounded-lg border flex flex-col items-center justify-between font-mono text-center transition ${
                  c.is_weakest
                    ? 'bg-amber-950/30 border-amber-500/50 shadow-md'
                    : 'bg-neutral-900/60 border-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-[10px] text-neutral-400">C{c.cell_index + 1}</span>
                  {c.is_weakest && (
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded">WEAK</span>
                  )}
                </div>
                <div className="text-sm font-bold text-white my-1">
                  {c.avg_voltage.toFixed(3)}<span className="text-[10px] font-normal text-neutral-400">V</span>
                </div>
                <div className="text-[10px] text-neutral-400 mt-1">
                  <span className={c.avg_delta_from_mean < 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    {c.avg_delta_from_mean > 0 ? `+${c.avg_delta_from_mean}` : c.avg_delta_from_mean} mV
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Sync Pipeline Details Footer ── */}
      <footer className="border-t border-white/10 pt-6 text-xs font-mono text-neutral-500 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Last Synced Server ID: #{overview?.sync_status.last_synced_id ?? 0}</span>
          <span>•</span>
          <span>Sync Status: {overview?.sync_status.status ?? 'idle'}</span>
        </div>
        <div>
          <span>Target GCP Host: {overview?.sync_status.target_server ?? '136.80.228.184'}</span>
        </div>
      </footer>
    </div>
  );
}
