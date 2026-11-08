import React from 'react';

export interface CellTileProps {
  index: number;
  voltage: number;
  min: number | null;
  max: number | null;
  count: number;
  onClick: () => void;
}

export default function CellTile({ index, voltage, min, max, count, onClick }: CellTileProps) {
  const isMin = count > 1 && voltage === min;
  const isMax = count > 1 && voltage === max;

  const paddedIndex = String(index).padStart(2, '0');

  let surface = 'bg-[#1b1b1f] border-white/10 text-neutral-200 hover:bg-[#24242a] hover:border-white/25';
  let badgeColor = 'text-neutral-500';
  let valColor = 'text-neutral-200';

  if (isMin) {
    surface = 'bg-[#BF3C27]/15 border-[#BF3C27]/50 text-rose-200 hover:bg-[#BF3C27]/25';
    badgeColor = 'text-rose-300/80';
    valColor = 'text-rose-200 font-semibold';
  } else if (isMax) {
    surface = 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200 hover:bg-emerald-500/25';
    badgeColor = 'text-emerald-300/80';
    valColor = 'text-emerald-200 font-semibold';
  }

  return (
    <button
      onClick={onClick}
      className={`border rounded-sm p-2 text-left cursor-pointer transition-all flex flex-col justify-between group focus:outline-none focus:ring-1 focus:ring-white/30 ${surface}`}
      title={`Cell ${index}: ${voltage.toFixed(3)} V (Click to view history)`}
    >
      <div className="flex items-center justify-between w-full mb-1">
        <span className={`font-mono text-[9px] uppercase tracking-wider ${badgeColor}`}>
          C{paddedIndex}
        </span>
        {isMin && <span className="font-mono text-[8px] px-1 rounded bg-[#BF3C27]/30 text-rose-300">MIN</span>}
        {isMax && <span className="font-mono text-[8px] px-1 rounded bg-emerald-500/30 text-emerald-300">MAX</span>}
      </div>
      <div className={`font-mono text-xs tabular-nums ${valColor}`}>
        {voltage.toFixed(3)}
        <span className="text-[10px] text-neutral-500 ml-0.5">V</span>
      </div>
    </button>
  );
}
