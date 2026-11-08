import React from 'react';

import { useTelemetry } from './useTelemetry.js';

export default function App() {
  const { latest, history } = useTelemetry();
  // Helper to render metric cards
  const renderCard = (title, value, unit, extraClass = '') => (
    <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
        <span>{title}</span>
      </div>
      <div className="my-2">
        <span className={`text-4xl font-extrabold tracking-tight ${extraClass}`} id={value.id}>--</span>
        <span className="text-sm font-semibold text-slate-400">{unit}</span>
      </div>
    </div>
  );

  // Render cells grid
  const renderCells = () => {
    if (!latest || !Array.isArray(latest.cell_voltages)) return null;
    const cells = latest.cell_voltages;
    const minV = Math.min(...cells);
    const maxV = Math.max(...cells);
    const avg = (cells.reduce((a, b) => a + b, 0) / cells.length).toFixed(3);
    return (
      <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-16 gap-3 auto-rows-min" id="cells-container">
        {cells.map((v, idx) => {
          let borderClass = "border-slate-800 bg-slate-800/60";
          let valClass = "text-slate-200";
          if (v === minV && cells.length > 1) { borderClass = "border-rose-500/50 bg-rose-500/10"; valClass = "text-rose-300 font-extrabold"; }
          else if (v === maxV && cells.length > 1) { borderClass = "border-emerald-500/50 bg-emerald-500/10"; valClass = "text-emerald-300 font-extrabold"; }
          return (
            <div key={idx} className={`${borderClass} rounded-xl p-2.5 text-center border transition-all`}>
              <div className="text-[10px] uppercase font-semibold text-slate-400">C{idx + 1}</div>
              <div className={`text-xs font-mono font-bold mt-0.5 ${valClass}`}>{Number(v).toFixed(3)}</div>
            </div>
          );
        })}
      </div>
    );
  };

  // Render history chart placeholder – Chart.js will be initialized in useEffect inside main.jsx
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900/80 p-4 rounded-2xl border border-slate-800 shadow-lg backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">JK-BMS Cloud Telemetry<span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">507268D28101263</span></h1>
            <p className="text-xs text-slate-400" id="last-update">Connecting to Cloudflare D1...</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <span id="status-pill" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Live Stream
          </span>
          <button onClick={() => window.dispatchEvent(new Event('fetchNow'))} className="px-3 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition">Refresh</button>
        </div>
      </header>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {renderCard('State of Charge', { id: 'val-soc' }, '%', 'text-emerald-400')}
        {renderCard('Pack Voltage', { id: 'val-voltage' }, 'V')}
        {renderCard('Current', { id: 'val-current' }, 'A')}
        {renderCard('Active Power', { id: 'val-power' }, 'W', 'text-amber-400')}
      </div>

      {/* Secondary Diagnostics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80 text-sm">
        <div><div className="text-slate-400 text-xs">Cell Delta (Max - Min)</div><div className="font-bold text-rose-400 text-lg mt-0.5" id="val-delta">-- mV</div><div className="text-[11px] text-slate-500" id="val-minmax-cells">Min: -- | Max: --</div></div>
        <div><div className="text-slate-400 text-xs">MOSFET Temp</div><div className="font-bold text-slate-200 text-lg mt-0.5" id="val-mos">-- °C</div></div>
        <div><div className="text-slate-400 text-xs">Battery Temp 1</div><div className="font-bold text-slate-200 text-lg mt-0.5" id="val-t1">-- °C</div></div>
        <div><div className="text-slate-400 text-xs">Remaining Capacity</div><div className="font-bold text-cyan-400 text-lg mt-0.5" id="val-cap-bottom">-- Ah</div><div className="text-[11px] text-slate-500">Estimated runtime: <span id="val-runtime">--</span></div></div>
      </div>

      {/* Cells grid */}
      {renderCells()}

      {/* History Chart */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Voltage & Current History</h2>
          <p className="text-xs text-slate-400">Logged in Cloudflare D1</p>
        </div>
        <div className="text-xs text-slate-400">Auto-updates every 30s</div>
      </div>
      <div className="h-64 sm:h-72"><canvas id="historyChart"></canvas></div>
    </div>
  );
}

