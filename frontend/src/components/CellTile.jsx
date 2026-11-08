import React from 'react';

export default function CellTile({ index, voltage, min, max, count, onClick }) {
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
