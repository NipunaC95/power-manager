import React from 'react';
import { formatTime } from '../utils/format.js';

export default function Chart({ title, data, getValue, unit, color, fillColor, decimals = 1 }) {
  const values = data.map(getValue).filter((v) => v != null && isFinite(v));
  if (values.length < 2) return null;

  const timestamps = data
    .filter((d) => getValue(d) != null && isFinite(getValue(d)))
    .map((d) => d.timestamp);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const latest = values[values.length - 1];

  const W = 300;
  const H = 80;
  const PAD_T = 4;
  const plotW = W;
  const plotH = H - PAD_T;

  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * plotW,
    y: PAD_T + plotH - ((v - min) / range) * plotH,
  }));

  const line = points.map((p) => `${p.x},${p.y}`).join(' ');
  const fill = [
    `${points[0].x},${PAD_T + plotH}`,
    ...points.map((p) => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${PAD_T + plotH}`,
  ].join(' ');

  const gridLines = [0, 0.5, 1].map((frac) => ({
    y: PAD_T + plotH - frac * plotH,
    label: (min + frac * range).toFixed(decimals),
  }));

  const firstTs = formatTime(timestamps[0]);
  const lastTs = formatTime(timestamps[timestamps.length - 1]);

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-xs font-medium text-slate-400">{title}</h3>
          <span className="text-lg font-semibold tabular-nums" style={{ color }}>
            {latest.toFixed(decimals)}
          </span>
          <span className="text-[11px] text-slate-500">{unit}</span>
        </div>
        <span className="text-[10px] text-slate-600">
          {min.toFixed(decimals)}–{max.toFixed(decimals)} {unit}
        </span>
      </div>

      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between py-0.5 pointer-events-none">
          {gridLines.slice().reverse().map((g, i) => (
            <span key={i} className="text-[9px] text-slate-600 tabular-nums leading-none">
              {g.label}
            </span>
          ))}
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28 ml-6" preserveAspectRatio="none">
          {gridLines.map((g, i) => (
            <line key={i} x1={0} y1={g.y} x2={W} y2={g.y}
              stroke="#1e293b" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          ))}
          <polygon points={fill} fill={fillColor} />
          <polyline points={line} fill="none" stroke={color}
            strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="flex justify-between text-[9px] text-slate-600 mt-1 ml-6">
        <span>{firstTs}</span>
        <span>{values.length} readings</span>
        <span>{lastTs}</span>
      </div>
    </div>
  );
}
