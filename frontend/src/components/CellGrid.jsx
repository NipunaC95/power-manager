import React from 'react';
import CellTile from './CellTile.jsx';

export default function CellGrid({ cells, minV, maxV, onCellClick }) {
  if (!cells.length) return null;

  return (
    <section className="mb-6">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 pb-2 mb-3 border-b border-dashed border-white/10">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-base text-neutral-100 font-normal">
            Cell Voltages
          </h2>
          <span className="font-mono text-[10px] text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded border border-white/5">
            {cells.length} Series
          </span>
        </div>
        <div className="font-mono text-[11px] text-neutral-400 flex items-center gap-2">
          <span>Min: <span className="text-rose-300 font-semibold">{minV?.toFixed(3)} V</span></span>
          <span className="text-neutral-600">/</span>
          <span>Max: <span className="text-emerald-300 font-semibold">{maxV?.toFixed(3)} V</span></span>
          <span className="text-neutral-600">/</span>
          <span className="text-neutral-400">Δ {((maxV - minV) * 1000).toFixed(0)} mV</span>
        </div>
      </div>

      <div className={`grid gap-2 ${cells.length <= 8 ? 'grid-cols-4 sm:grid-cols-8' : 'grid-cols-4 sm:grid-cols-8 md:grid-cols-16'}`}>
        {cells.map((v, i) => (
          <CellTile
            key={i}
            index={i + 1}
            voltage={v}
            min={minV}
            max={maxV}
            count={cells.length}
            onClick={() => onCellClick(i)}
          />
        ))}
      </div>
      <p className="font-mono text-[10px] text-neutral-500 mt-2">
        Click any cell block to inspect individual voltage history curve.
      </p>
    </section>
  );
}
