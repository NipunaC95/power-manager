import React from 'react';

export default function Metric({ label, value, unit, large, color = 'text-neutral-100', sub }) {
  return (
    <div className="bg-[#1b1b1f] border border-white/10 rounded-sm p-3.5 flex flex-col justify-between hover:border-white/20 transition-colors group">
      {/* Label with Zed style dashed/dotted sub-line */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-dashed border-white/10">
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400 group-hover:text-neutral-300 transition-colors">
          {label}
        </span>
        <span className="font-mono text-[10px] text-neutral-500">
          [{unit}]
        </span>
      </div>

      {/* Main value */}
      <div className="flex items-baseline gap-1.5 my-0.5">
        <span className={`font-mono font-medium tabular-nums tracking-tight ${large ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'} ${color}`}>
          {value}
        </span>
        <span className="font-mono text-xs text-neutral-500">
          {unit}
        </span>
      </div>

      {/* Optional sub info */}
      {sub ? (
        <div className="font-serif italic text-[11px] text-neutral-400 mt-1">
          {sub}
        </div>
      ) : (
        <div className="h-4" />
      )}
    </div>
  );
}
