import React from 'react';
import { useTelemetry } from './useTelemetry.js';

export default function App() {
  const { latest, history } = useTelemetry();

  const val = (key, fallback = null) =>
    latest && latest[key] != null ? latest[key] : fallback;

  const fmt = (key, decimals = 1) => {
    const v = val(key);
    return v != null ? Number(v).toFixed(decimals) : '—';
  };

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
  const cellDiffMv = minV != null ? ((maxV - minV) * 1000).toFixed(0) : '—';
  const soc = val('soc');
  const current = val('current');
  const isCharging = current != null && Number(current) > 0.5;
  const isDischarging = current != null && Number(current) < -0.5;
  const isOnline = !!latest;

  const getRuntime = () => {
    const cap = val('capacity_remaining');
    const cur = val('current');
    if (cap == null || cur == null || Number(cur) >= 0) return null;
    const hours = Number(cap) / Math.abs(Number(cur));
    if (hours > 24) return `${(hours / 24).toFixed(1)}d`;
    if (hours >= 1) return `${hours.toFixed(1)}h`;
    return `${(hours * 60).toFixed(0)}m`;
  };

  const lastUpdate = latest?.timestamp
    ? timeAgo(latest.timestamp)
    : null;

  return (
    <div className="max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">BMS Monitor</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isOnline ? `Updated ${lastUpdate}` : 'Connecting…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            label={isCharging ? 'Charging' : isDischarging ? 'Discharging' : 'Idle'}
            color={isCharging ? 'green' : isDischarging ? 'amber' : 'slate'}
          />
          <ConnectionDot online={isOnline} />
        </div>
      </div>

      {/* Primary metrics */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <Metric label="SOC" value={soc != null ? soc : '—'} unit="%" large
          color={soc != null && soc < 20 ? 'text-red-400' : soc != null && soc > 80 ? 'text-emerald-400' : 'text-white'} />
        <Metric label="Voltage" value={fmt('total_voltage', 2)} unit="V" large />
        <Metric label="Current" value={fmt('current', 2)} unit="A" large
          color={isCharging ? 'text-emerald-400' : isDischarging ? 'text-amber-400' : 'text-white'} />
        <Metric label="Power" value={fmt('power', 0)} unit="W" large />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <Metric label="Cell Δ" value={cellDiffMv} unit="mV"
          color={cellDiffMv !== '—' && Number(cellDiffMv) > 30 ? 'text-red-400' : 'text-slate-200'} />
        <Metric label="MOS Temp" value={fmt('temp_mos')} unit="°C" />
        <Metric label="Bat Temp 1" value={fmt('temp_battery_1')} unit="°C" />
        <Metric label="Bat Temp 2" value={fmt('temp_battery_2')} unit="°C" />
        <Metric label="Capacity" value={fmt('capacity_remaining', 1)} unit="Ah"
          sub={getRuntime() ? `~${getRuntime()} left` : null} />
      </div>

      {/* Cell voltages */}
      {cells.length > 0 && (
        <div className="mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Cell Voltages</h2>
            <span className="text-[11px] text-slate-500">
              {minV.toFixed(3)}V min · {maxV.toFixed(3)}V max
            </span>
          </div>
          <div className={`grid gap-1.5 ${cells.length <= 8 ? 'grid-cols-8' : 'grid-cols-8 sm:grid-cols-16'}`}>
            {cells.map((v, i) => (
              <CellTile key={i} index={i + 1} voltage={v} min={minV} max={maxV} count={cells.length} />
            ))}
          </div>
        </div>
      )}

      {/* Switches */}
      <div className="flex gap-3 mb-6">
        <SwitchIndicator label="Charge" enabled={val('charging_enabled') === 1} />
        <SwitchIndicator label="Discharge" enabled={val('discharging_enabled') === 1} />
      </div>

      {/* History chart placeholder */}
      {history.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">History</h2>
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
            <MiniChart data={history} />
          </div>
        </div>
      )}
    </div>
  );
}


/* ── Components ──────────────────────────────────────────── */

function Metric({ label, value, unit, large, color = 'text-white', sub }) {
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 px-3 py-2.5">
      <div className="text-[11px] text-slate-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={`${large ? 'text-2xl' : 'text-lg'} font-semibold tabular-nums ${color}`}>{value}</span>
        <span className="text-xs text-slate-500">{unit}</span>
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function CellTile({ index, voltage, min, max, count }) {
  const isMin = count > 1 && voltage === min;
  const isMax = count > 1 && voltage === max;

  let bg = 'bg-slate-800/50';
  let text = 'text-slate-300';
  let border = 'border-transparent';

  if (isMin) { bg = 'bg-red-950/40'; text = 'text-red-400'; border = 'border-red-500/30'; }
  if (isMax) { bg = 'bg-emerald-950/40'; text = 'text-emerald-400'; border = 'border-emerald-500/30'; }

  return (
    <div className={`${bg} ${border} border rounded-md px-1.5 py-1.5 text-center`}>
      <div className="text-[9px] text-slate-500 leading-none mb-0.5">C{index}</div>
      <div className={`text-[11px] font-mono font-medium leading-none ${text}`}>
        {voltage.toFixed(3)}
      </div>
    </div>
  );
}

function StatusBadge({ label, color }) {
  const colors = {
    green: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
    slate: 'bg-slate-800 text-slate-400',
  };
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${colors[color] || colors.slate}`}>
      {label}
    </span>
  );
}

function ConnectionDot({ online }) {
  return (
    <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-slate-600'}`}
      title={online ? 'Connected' : 'Offline'} />
  );
}

function SwitchIndicator({ label, enabled }) {
  return (
    <div className={`text-xs px-3 py-1.5 rounded border ${
      enabled
        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
        : 'bg-red-500/5 border-red-500/20 text-red-400'
    }`}>
      {label}: {enabled ? 'ON' : 'OFF'}
    </div>
  );
}

function MiniChart({ data }) {
  if (!data.length) return null;

  const voltages = data.map(d => d.total_voltage).filter(Boolean);
  const currents = data.map(d => d.current).filter(Boolean);

  if (!voltages.length) return <p className="text-xs text-slate-500">No chart data</p>;

  const vMin = Math.min(...voltages);
  const vMax = Math.max(...voltages);
  const vRange = vMax - vMin || 1;

  const w = 100;
  const h = 40;

  const vPoints = voltages.map((v, i) =>
    `${(i / (voltages.length - 1)) * w},${h - ((v - vMin) / vRange) * h}`
  ).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32" preserveAspectRatio="none">
        <polyline points={vPoints} fill="none" stroke="#60a5fa" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        <span>{voltages.length} readings</span>
        <span>{vMin.toFixed(1)}–{vMax.toFixed(1)}V</span>
      </div>
    </div>
  );
}


/* ── Helpers ─────────────────────────────────────────────── */

function timeAgo(ts) {
  const d = new Date(ts.includes('Z') || ts.includes('+') ? ts : ts + 'Z');
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}
