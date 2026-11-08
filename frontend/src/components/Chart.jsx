import React from 'react';
import { formatTime } from '../utils/format.js';

export default function Chart({ title, data, getValue, unit, color = '#3b82f6', fillColor = 'rgba(59, 130, 246, 0.06)', decimals = 1 }) {
  const values = data.map(getValue).filter((v) => v != null && isFinite(v));
  if (values.length < 2) return null;

  const timestamps = data
    .filter((d) => getValue(d) != null && isFinite(getValue(d)))
    .map((d) => d.timestamp);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const valDiff = max - min;
  const padding = valDiff === 0 ? (Math.abs(min) * 0.01 || 0.05) : valDiff * 0.08;
  const plotMin = min - padding;
  const plotMax = max + padding;
  const range = plotMax - plotMin || 1;
  const latest = values[values.length - 1];

  const W = 320;
  const H = 90;
  const PAD_T = 6;
  const PAD_B = 2;
  const plotW = W;
  const plotH = H - PAD_T - PAD_B;

  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * plotW,
    y: PAD_T + plotH - ((v - plotMin) / range) * plotH,
  }));

  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const fill = [
    `0,${PAD_T + plotH}`,
    ...points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `${plotW},${PAD_T + plotH}`,
  ].join(' ');

  const gridFractions = [0.15, 0.5, 0.85];
  const gridLines = gridFractions.map((frac) => ({
    y: PAD_T + plotH - frac * plotH,
    label: (plotMin + frac * range).toFixed(decimals),
  }));

  const firstTs = formatTime(timestamps[0]);
  const lastTs = formatTime(timestamps[timestamps.length - 1]);

  return (
    <div className="bg-[#1b1b1f] border border-white/10 rounded-sm p-4 flex flex-col justify-between hover:border-white/20 transition-colors">
      {/* Chart Header */}
      <div className="flex items-baseline justify-between pb-2 mb-3 border-b border-dashed border-white/10">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="font-serif text-sm text-neutral-100 font-normal">
            {title}
          </h3>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-base font-medium tabular-nums" style={{ color }}>
            {latest.toFixed(decimals)}
          </span>
          <span className="font-mono text-[11px] text-neutral-500">
            {unit}
          </span>
        </div>
      </div>

      {/* SVG Canvas with Y-Axis */}
      <div className="relative my-1">
        {/* Y-axis markers */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between pointer-events-none py-1">
          {gridLines.slice().reverse().map((g, i) => (
            <span key={i} className="font-mono text-[9px] text-neutral-500 tabular-nums">
              {g.label}
            </span>
          ))}
        </div>

        {/* Graph */}
        <div className="ml-8">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28 overflow-visible" preserveAspectRatio="none">
            {/* Horizontal guidelines */}
            {gridLines.map((g, i) => (
              <line
                key={i}
                x1={0}
                y1={g.y}
                x2={W}
                y2={g.y}
                stroke="rgba(255, 255, 255, 0.07)"
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/* Area Fill */}
            <polygon points={fill} fill={fillColor} />
            {/* Smooth stroke */}
            <polyline
              points={line}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>

      {/* Time & Count Footer */}
      <div className="flex justify-between items-center font-mono text-[10px] text-neutral-500 pt-2 border-t border-white/5 ml-8 mt-1">
        <span>{firstTs}</span>
        <span className="text-neutral-600">({values.length} records)</span>
        <span>{lastTs}</span>
      </div>
    </div>
  );
}
