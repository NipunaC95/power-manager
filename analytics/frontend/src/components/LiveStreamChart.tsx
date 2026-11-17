import React, { useMemo } from 'react';

export interface DataPoint {
  timestamp: string;
  voltage: number;
  current: number;
  power: number;
}

interface LiveStreamChartProps {
  data: DataPoint[];
  height?: number;
}

export default function LiveStreamChart({ data, height = 180 }: LiveStreamChartProps) {
  const points = useMemo(() => data.slice(-50), [data]);

  if (points.length < 2) {
    return (
      <div
        style={{ height }}
        className="w-full bg-neutral-900/40 border border-white/5 rounded-xl flex items-center justify-center font-mono text-xs text-neutral-500"
      >
        Waiting for realtime stream points...
      </div>
    );
  }

  // Voltage scale
  const voltages = points.map((p) => p.voltage);
  const minV = Math.floor(Math.min(...voltages) * 10) / 10 - 0.2;
  const maxV = Math.ceil(Math.max(...voltages) * 10) / 10 + 0.2;
  const vRange = maxV - minV || 1;

  // Power scale
  const powers = points.map((p) => p.power);
  const minP = Math.min(-100, Math.floor(Math.min(...powers)));
  const maxP = Math.max(100, Math.ceil(Math.max(...powers)));
  const pRange = maxP - minP || 1;

  const width = 800;
  const padTop = 15;
  const padBottom = 25;
  const plotH = height - padTop - padBottom;

  // Generate SVG path for Voltage
  const vPath = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = padTop + plotH - ((p.voltage - minV) / vRange) * plotH;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  // Generate SVG path for Power
  const pPath = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = padTop + plotH - ((p.power - minP) / pRange) * plotH;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const latest = points[points.length - 1];

  return (
    <div className="w-full bg-neutral-900/60 border border-white/5 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3 text-xs font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-2.5 h-1 bg-emerald-400 rounded"></span> Voltage ({latest.voltage.toFixed(2)}V)
          </span>
          <span className="flex items-center gap-1.5 text-amber-400 font-medium">
            <span className="w-2.5 h-1 bg-amber-400 rounded"></span> Power ({latest.power.toFixed(1)}W)
          </span>
        </div>
        <span className="text-neutral-500 text-[11px] flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Streaming (last 50 pts)
        </span>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {/* Horizontal gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = padTop + plotH * pct;
            return (
              <line
                key={pct}
                x1={0}
                y1={y}
                x2={width}
                y2={y}
                stroke="rgba(255, 255, 255, 0.05)"
                strokeDasharray="4 4"
              />
            );
          })}

          {/* Voltage Line (Emerald) */}
          <path d={vPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Power Line (Amber) */}
          <path d={pPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Min/Max Y labels */}
        <div className="absolute left-1 top-2 text-[10px] font-mono text-emerald-400/80">
          {maxV.toFixed(1)}V
        </div>
        <div className="absolute left-1 bottom-4 text-[10px] font-mono text-emerald-400/80">
          {minV.toFixed(1)}V
        </div>
        <div className="absolute right-1 top-2 text-[10px] font-mono text-amber-400/80">
          {maxP.toFixed(0)}W
        </div>
        <div className="absolute right-1 bottom-4 text-[10px] font-mono text-amber-400/80">
          {minP.toFixed(0)}W
        </div>
      </div>
    </div>
  );
}

