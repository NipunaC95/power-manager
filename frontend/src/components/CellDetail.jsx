import React, { useState, useEffect } from 'react';
import Chart from './Chart.jsx';
import Metric from './Metric.jsx';
import { parseCells } from '../utils/format.js';

export default function CellDetail({ cellIndex, cells, history, onCellChange, onBack }) {
  const [apiHistory, setApiHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const voltage = cells[cellIndex] != null ? cells[cellIndex] : null;
  const num = cellIndex + 1;
  const paddedNum = String(num).padStart(2, '0');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setApiHistory([]);

    const load = () =>
      fetch(`/api/cells?cell=${cellIndex}&limit=200`)
        .then((r) => r.ok ? r.json() : [])
        .then((data) => { if (!cancelled && Array.isArray(data)) setApiHistory(data); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });

    load();
    const interval = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [cellIndex]);

  // Fallback to pack history if needed
  const historyData = apiHistory.length > 1
    ? apiHistory
    : (history || [])
        .map((row) => {
          const rowCells = parseCells(row);
          if (rowCells[cellIndex] == null) return null;
          return { voltage: rowCells[cellIndex], timestamp: row.timestamp };
        })
        .filter(Boolean);

  const voltages = historyData.map((d) => d.voltage).filter((v) => v != null);
  const min = voltages.length ? Math.min(...voltages) : null;
  const max = voltages.length ? Math.max(...voltages) : null;
  const avg = voltages.length ? voltages.reduce((a, b) => a + b, 0) / voltages.length : null;

  return (
    <section className="mb-6">
      {/* Top breadcrumb navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-dashed border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="zed-btn-neutral px-2.5 py-1 rounded text-xs font-mono text-neutral-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
          >
            <span>←</span>
            <span>Grid</span>
          </button>
          <div className="h-4 w-[1px] bg-white/10" />
          <h2 className="font-serif text-lg text-white font-normal flex items-center gap-2">
            <span>Cell {paddedNum}</span>
            <span className="italic text-neutral-400 font-serif font-light text-sm">Diagnostic</span>
          </h2>
        </div>

        {voltage != null && (
          <div className="font-mono text-sm font-medium text-neutral-200 flex items-center gap-1.5 bg-neutral-900 px-2.5 py-1 rounded border border-white/10">
            <span className="text-neutral-500 text-xs">CURRENT:</span>
            <span className="text-white font-semibold">{voltage.toFixed(3)}</span>
            <span className="text-neutral-500 text-xs">V</span>
          </div>
        )}
      </div>

      {/* Quick Cell Selector Tabs */}
      {cells.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-4 scrollbar-none">
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 mr-1.5 shrink-0">
            Channel:
          </span>
          {cells.map((_, i) => (
            <button
              key={i}
              onClick={() => onCellChange(i)}
              className={`font-mono text-[11px] px-2 py-1 rounded-sm shrink-0 transition-all cursor-pointer ${
                i === cellIndex
                  ? 'zed-btn-rust text-white font-semibold'
                  : 'zed-btn-neutral text-neutral-400 hover:text-neutral-200'
              }`}
            >
              C{String(i + 1).padStart(2, '0')}
            </button>
          ))}
        </div>
      )}

      {/* Metric summary for selected cell */}
      {voltages.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Metric label="Recorded Min" value={min.toFixed(3)} unit="V" color="text-rose-300" />
          <Metric label="Running Avg" value={avg.toFixed(3)} unit="V" color="text-neutral-100" />
          <Metric label="Recorded Max" value={max.toFixed(3)} unit="V" color="text-emerald-300" />
        </div>
      )}

      {/* Cell History Chart */}
      {loading && apiHistory.length === 0 && historyData.length < 2 ? (
        <div className="bg-[#1b1b1f] border border-white/10 rounded-sm p-8 text-center font-mono text-xs text-neutral-500">
          Syncing cell telemetry buffer…
        </div>
      ) : historyData.length > 1 ? (
        <Chart
          title={`Cell ${paddedNum} Voltage History`}
          data={historyData}
          getValue={(d) => d.voltage}
          unit="V"
          color="#BF3C27"
          fillColor="rgba(191, 60, 39, 0.08)"
          decimals={3}
        />
      ) : (
        <div className="bg-[#1b1b1f] border border-white/10 rounded-sm p-8 text-center font-mono text-xs text-neutral-500">
          Not enough historical records yet for Cell {paddedNum}.
        </div>
      )}
    </section>
  );
}
