import React from 'react';
import { useTelemetry } from './useTelemetry.js';

export default function App() {
  const { latest, history } = useTelemetry();

  // Safely read a value from latest telemetry
  const val = (key, fallback = '--') =>
    latest && latest[key] != null ? latest[key] : fallback;

  // Format numbers
  const fmt = (key, decimals = 1) => {
    const v = val(key, null);
    return v != null ? Number(v).toFixed(decimals) : '--';
  };

  // Parse cell_voltages (may already be an array from the API, or a JSON string)
  const getCells = () => {
    if (!latest) return [];
    let cells = latest.cell_voltages;
    if (typeof cells === 'string') {
      try { cells = JSON.parse(cells); } catch { return []; }
    }
    return Array.isArray(cells) ? cells.map(Number) : [];
  };

  const cells = getCells();
  const minV = cells.length ? Math.min(...cells) : null;
  const maxV = cells.length ? Math.max(...cells) : null;
  const cellDiff = minV != null && maxV != null ? ((maxV - minV) * 1000).toFixed(0) : '--';

  // Estimated runtime
  const getRuntime = () => {
    const cap = val('capacity_remaining', null);
    const cur = val('current', null);
    if (cap == null || cur == null || Number(cur) >= 0) return '--';
    const hours = Number(cap) / Math.abs(Number(cur));
    if (hours > 24) return `${(hours / 24).toFixed(1)}d`;
    if (hours >= 1) return `${hours.toFixed(1)}h`;
    return `${(hours * 60).toFixed(0)}m`;
  };

  // Status
  const isOnline = !!latest;
  const lastUpdate = latest?.timestamp
    ? new Date(latest.timestamp + 'Z').toLocaleString()
    : 'Connecting to Cloudflare D1...';

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900/80 p-4 rounded-2xl border border-slate-800 shadow-lg backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              JK-BMS Cloud Telemetry
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">507268D28101263</span>
            </h1>
            <p className="text-xs text-slate-400">{lastUpdate}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
            isOnline
              ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
            {isOnline ? 'Live Stream' : 'Offline'}
          </span>
          <button onClick={() => window.dispatchEvent(new Event('fetchNow'))} className="px-3 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition">Refresh</button>
        </div>
      </header>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="State of Charge" value={val('soc', '--')} unit="%" valueClass="text-emerald-400" />
        <MetricCard title="Pack Voltage" value={fmt('total_voltage', 2)} unit="V" />
        <MetricCard title="Current" value={fmt('current', 2)} unit="A" />
        <MetricCard title="Active Power" value={fmt('power', 0)} unit="W" valueClass="text-amber-400" />
      </div>

      {/* Secondary Diagnostics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80 text-sm">
        <div>
          <div className="text-slate-400 text-xs">Cell Delta (Max − Min)</div>
          <div className="font-bold text-rose-400 text-lg mt-0.5">{cellDiff} mV</div>
          <div className="text-[11px] text-slate-500">
            Min: {minV != null ? minV.toFixed(3) : '--'} | Max: {maxV != null ? maxV.toFixed(3) : '--'}
          </div>
        </div>
        <div>
          <div className="text-slate-400 text-xs">MOSFET Temp</div>
          <div className="font-bold text-slate-200 text-lg mt-0.5">{fmt('temp_mos')} °C</div>
        </div>
        <div>
          <div className="text-slate-400 text-xs">Battery Temp 1</div>
          <div className="font-bold text-slate-200 text-lg mt-0.5">{fmt('temp_battery_1')} °C</div>
        </div>
        <div>
          <div className="text-slate-400 text-xs">Remaining Capacity</div>
          <div className="font-bold text-cyan-400 text-lg mt-0.5">{fmt('capacity_remaining')} Ah</div>
          <div className="text-[11px] text-slate-500">Estimated runtime: {getRuntime()}</div>
        </div>
      </div>

      {/* Cells Grid */}
      {cells.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-16 gap-3 auto-rows-min">
          {cells.map((v, idx) => {
            let borderClass = 'border-slate-800 bg-slate-800/60';
            let valClass = 'text-slate-200';
            if (v === minV && cells.length > 1) { borderClass = 'border-rose-500/50 bg-rose-500/10'; valClass = 'text-rose-300 font-extrabold'; }
            else if (v === maxV && cells.length > 1) { borderClass = 'border-emerald-500/50 bg-emerald-500/10'; valClass = 'text-emerald-300 font-extrabold'; }
            return (
              <div key={idx} className={`${borderClass} rounded-xl p-2.5 text-center border transition-all`}>
                <div className="text-[10px] uppercase font-semibold text-slate-400">C{idx + 1}</div>
                <div className={`text-xs font-mono font-bold mt-0.5 ${valClass}`}>{v.toFixed(3)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* History Chart */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Voltage &amp; Current History</h2>
          <p className="text-xs text-slate-400">Logged in Cloudflare D1</p>
        </div>
        <div className="text-xs text-slate-400">Auto-updates every 30s</div>
      </div>
      <div className="h-64 sm:h-72"><canvas id="historyChart"></canvas></div>
    </div>
  );
}

function MetricCard({ title, value, unit, valueClass = '' }) {
  return (
    <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
        <span>{title}</span>
      </div>
      <div className="my-2">
        <span className={`text-4xl font-extrabold tracking-tight ${valueClass}`}>{value}</span>
        <span className="text-sm font-semibold text-slate-400"> {unit}</span>
      </div>
    </div>
  );
}
