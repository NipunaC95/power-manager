import React from 'react';

export default function Metric({ label, value, unit, large, color = 'text-white', sub }) {
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
