import React, { useState, useEffect } from 'react';
import Chart from './Chart.jsx';
import Metric from './Metric.jsx';

export default function CellDetail({ cellIndex, cells, onCellChange, onBack }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const voltage = cells[cellIndex] != null ? cells[cellIndex] : null;
  const num = cellIndex + 1;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHistory([]);

    const load = () =>
      fetch(`/api/cells?cell=${cellIndex}&limit=200`)
        .then((r) => r.json())
        .then((data) => { if (!cancelled && Array.isArray(data)) setHistory(data); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });

    load();
    const interval = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [cellIndex]);

  const voltages = history.map((d) => d.voltage).filter((v) => v != null);
  const min = voltages.length ? Math.min(...voltages) : null;
  const max = voltages.length ? Math.max(...voltages) : null;
  const avg = voltages.length ? voltages.reduce((a, b) => a + b, 0) / voltages.length : null;

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={onBack}
          className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-700 hover:border-slate-500 transition-colors">
          ← Back
        </button>
        <h2 className="text-sm font-medium text-white">Cell {num}</h2>
        {voltage != null && (
          <span className="text-sm font-semibold tabular-nums text-blue-400">{voltage.toFixed(3)} V</span>
        )}
      </div>

      {/* Stats */}
      {voltages.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Metric label="Min" value={min.toFixed(3)} unit="V" color="text-red-400" />
          <Metric label="Avg" value={avg.toFixed(3)} unit="V" />
          <Metric label="Max" value={max.toFixed(3)} unit="V" color="text-emerald-400" />
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 text-xs text-slate-500">
          Loading cell history…
        </div>
      ) : voltages.length > 1 ? (
        <Chart
          title={`Cell ${num} Voltage`}
          data={history}
          getValue={(d) => d.voltage}
          unit="V"
          color="#818cf8"
          fillColor="rgba(129,140,248,0.08)"
          decimals={3}
        />
      ) : (
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 text-xs text-slate-500">
          Not enough history yet. Data recorded after deploying the new schema.
        </div>
      )}

      {/* Cell nav */}
      {cells.length > 1 && (
        <div className="flex items-center gap-1.5 mt-3">
          <span className="text-[10px] text-slate-500 mr-1">Cell:</span>
          {cells.map((_, i) => (
            <button key={i} onClick={() => onCellChange(i)}
              className={`text-[10px] w-6 h-6 rounded ${
                i === cellIndex
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'bg-slate-800 text-slate-400 border border-transparent hover:border-slate-600'
              }`}>
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

