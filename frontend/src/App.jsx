import React, { useState, useEffect, useCallback } from 'react';
import { useTelemetry } from './useTelemetry.js';

export default function App() {
  const { latest, history } = useTelemetry();
  const [selectedCell, setSelectedCell] = useState(null);

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

      {/* Cell detail view */}
      {selectedCell != null && (
        <CellDetail cellIndex={selectedCell} cells={cells} onBack={() => setSelectedCell(null)} />
      )}

      {/* Cell voltages */}
      {cells.length > 0 && selectedCell == null && (
        <div className="mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Cell Voltages</h2>
            <span className="text-[11px] text-slate-500">
              {minV.toFixed(3)}V min · {maxV.toFixed(3)}V max
            </span>
          </div>
          <div className={`grid gap-1.5 ${cells.length <= 8 ? 'grid-cols-8' : 'grid-cols-8 sm:grid-cols-16'}`}>
            {cells.map((v, i) => (
              <CellTile key={i} index={i + 1} voltage={v} min={minV} max={maxV} count={cells.length}
                onClick={() => setSelectedCell(i)} />
            ))}
          </div>
        </div>
      )}

      {/* Switches */}
      <div className="flex gap-3 mb-6">
        <SwitchIndicator label="Charge" enabled={val('charging_enabled') === 1} />
        <SwitchIndicator label="Discharge" enabled={val('discharging_enabled') === 1} />
      </div>

      {/* Charts */}
      {history.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Chart
            title="Voltage"
            data={history}
            getValue={(d) => d.total_voltage}
            unit="V"
            color="#60a5fa"
            fillColor="rgba(96,165,250,0.08)"
            decimals={2}
          />
          <Chart
            title="Power"
            data={history}
            getValue={(d) => d.total_voltage * d.current}
            unit="W"
            color="#fbbf24"
            fillColor="rgba(251,191,36,0.08)"
            decimals={0}
          />
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

function CellTile({ index, voltage, min, max, count, onClick }) {
  const isMin = count > 1 && voltage === min;
  const isMax = count > 1 && voltage === max;

  let bg = 'bg-slate-800/50';
  let text = 'text-slate-300';
  let border = 'border-transparent';

  if (isMin) { bg = 'bg-red-950/40'; text = 'text-red-400'; border = 'border-red-500/30'; }
  if (isMax) { bg = 'bg-emerald-950/40'; text = 'text-emerald-400'; border = 'border-emerald-500/30'; }

  return (
    <button onClick={onClick}
      className={`${bg} ${border} border rounded-md px-1.5 py-1.5 text-center cursor-pointer hover:border-slate-600 transition-colors`}>
      <div className="text-[9px] text-slate-500 leading-none mb-0.5">C{index}</div>
      <div className={`text-[11px] font-mono font-medium leading-none ${text}`}>
        {voltage.toFixed(3)}
      </div>
    </button>
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

function Chart({ title, data, getValue, unit, color, fillColor, decimals = 1 }) {
  const values = data.map(getValue).filter((v) => v != null && isFinite(v));
  if (values.length < 2) return null;

  const timestamps = data
    .filter((d) => getValue(d) != null && isFinite(getValue(d)))
    .map((d) => d.timestamp);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const latest = values[values.length - 1];

  // Chart dimensions
  const W = 300;
  const H = 80;
  const PAD_L = 0;
  const PAD_R = 0;
  const PAD_T = 4;
  const PAD_B = 0;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  // Build polyline + fill polygon
  const points = values.map((v, i) => {
    const x = PAD_L + (i / (values.length - 1)) * plotW;
    const y = PAD_T + plotH - ((v - min) / range) * plotH;
    return { x, y };
  });

  const line = points.map((p) => `${p.x},${p.y}`).join(' ');
  const fill = [
    `${points[0].x},${PAD_T + plotH}`,
    ...points.map((p) => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${PAD_T + plotH}`,
  ].join(' ');

  // Y-axis grid lines (3 lines)
  const gridLines = [0, 0.5, 1].map((frac) => {
    const y = PAD_T + plotH - frac * plotH;
    const val = min + frac * range;
    return { y, label: val.toFixed(decimals) };
  });

  // Time labels
  const firstTs = formatTime(timestamps[0]);
  const lastTs = formatTime(timestamps[timestamps.length - 1]);

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-xs font-medium text-slate-400">{title}</h3>
          <span className="text-lg font-semibold tabular-nums" style={{ color }}>
            {latest.toFixed(decimals)}
          </span>
          <span className="text-[11px] text-slate-500">{unit}</span>
        </div>
        <span className="text-[10px] text-slate-600">
          {min.toFixed(decimals)}–{max.toFixed(decimals)} {unit}
        </span>
      </div>

      <div className="relative">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between py-0.5 pointer-events-none">
          {gridLines.slice().reverse().map((g, i) => (
            <span key={i} className="text-[9px] text-slate-600 tabular-nums leading-none">
              {g.label}
            </span>
          ))}
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28 ml-6" preserveAspectRatio="none">
          {/* Grid lines */}
          {gridLines.map((g, i) => (
            <line key={i} x1={PAD_L} y1={g.y} x2={W - PAD_R} y2={g.y}
              stroke="#1e293b" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          ))}
          {/* Fill area */}
          <polygon points={fill} fill={fillColor} />
          {/* Line */}
          <polyline points={line} fill="none" stroke={color}
            strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Time axis */}
      <div className="flex justify-between text-[9px] text-slate-600 mt-1 ml-6">
        <span>{firstTs}</span>
        <span>{values.length} readings</span>
        <span>{lastTs}</span>
      </div>
    </div>
  );
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts.includes('Z') || ts.includes('+') ? ts : ts + 'Z');
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}


/* ── Cell Detail View ────────────────────────────────────── */

function CellDetail({ cellIndex, cells, onBack }) {
  const [cellHistory, setCellHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentVoltage = cells[cellIndex] != null ? cells[cellIndex] : null;
  const cellNum = cellIndex + 1;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/cells?cell=${cellIndex}&limit=200`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setCellHistory(data);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    // Re-fetch every 10s
    const interval = setInterval(() => {
      fetch(`/api/cells?cell=${cellIndex}&limit=200`)
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled && Array.isArray(data)) setCellHistory(data);
        })
        .catch(() => {});
    }, 10000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [cellIndex]);

  const voltages = cellHistory.map((d) => d.voltage).filter((v) => v != null);
  const min = voltages.length ? Math.min(...voltages) : null;
  const max = voltages.length ? Math.max(...voltages) : null;
  const avg = voltages.length ? voltages.reduce((a, b) => a + b, 0) / voltages.length : null;

  return (
    <div className="mb-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={onBack}
          className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-700 hover:border-slate-500 transition-colors">
          ← Back
        </button>
        <h2 className="text-sm font-medium text-white">Cell {cellNum}</h2>
        {currentVoltage != null && (
          <span className="text-sm font-semibold tabular-nums text-blue-400">
            {currentVoltage.toFixed(3)} V
          </span>
        )}
      </div>

      {/* Stats row */}
      {voltages.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-slate-900 rounded-lg border border-slate-800 px-3 py-2">
            <div className="text-[10px] text-slate-500">Min</div>
            <div className="text-sm font-semibold tabular-nums text-red-400">{min.toFixed(3)} V</div>
          </div>
          <div className="bg-slate-900 rounded-lg border border-slate-800 px-3 py-2">
            <div className="text-[10px] text-slate-500">Avg</div>
            <div className="text-sm font-semibold tabular-nums text-slate-200">{avg.toFixed(3)} V</div>
          </div>
          <div className="bg-slate-900 rounded-lg border border-slate-800 px-3 py-2">
            <div className="text-[10px] text-slate-500">Max</div>
            <div className="text-sm font-semibold tabular-nums text-emerald-400">{max.toFixed(3)} V</div>
          </div>
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 text-xs text-slate-500">
          Loading cell history…
        </div>
      ) : voltages.length > 1 ? (
        <Chart
          title={`Cell ${cellNum} Voltage`}
          data={cellHistory}
          getValue={(d) => d.voltage}
          unit="V"
          color="#818cf8"
          fillColor="rgba(129,140,248,0.08)"
          decimals={3}
        />
      ) : (
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 text-xs text-slate-500">
          Not enough history data yet. Cell data is recorded after deploying the new schema.
        </div>
      )}

      {/* Cell navigation */}
      {cells.length > 1 && (
        <div className="flex items-center gap-1.5 mt-3">
          <span className="text-[10px] text-slate-500 mr-1">Jump to:</span>
          {cells.map((_, i) => (
            <button key={i} onClick={() => { if (i !== cellIndex) { setCellHistory([]); setLoading(true); } }}
              className={`text-[10px] w-6 h-6 rounded ${
                i === cellIndex
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'bg-slate-800 text-slate-400 border border-transparent hover:border-slate-600'
              }`}
              onClick={() => { /* parent handles via onBack + reselect */ }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
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
