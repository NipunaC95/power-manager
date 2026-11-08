import React from 'react';
import CellTile from './CellTile.jsx';

export default function CellGrid({ cells, minV, maxV, onCellClick }) {
  if (!cells.length) return null;

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Cell Voltages</h2>
        <span className="text-[11px] text-slate-500">
          {minV.toFixed(3)}V min · {maxV.toFixed(3)}V max
        </span>
      </div>
      <div className={`grid gap-1.5 ${cells.length <= 8 ? 'grid-cols-8' : 'grid-cols-8 sm:grid-cols-16'}`}>
        {cells.map((v, i) => (
          <CellTile key={i} index={i + 1} voltage={v} min={minV} max={maxV}
            count={cells.length} onClick={() => onCellClick(i)} />
        ))}
      </div>
    </div>
  );
}

