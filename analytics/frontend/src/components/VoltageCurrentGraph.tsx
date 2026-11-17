import React, { useMemo } from 'react';
import { DataPoint } from './LiveStreamChart';

interface VoltageCurrentGraphProps {
  data: DataPoint[];
  currentVoltage: number;
  currentAmps: number;
  height?: number;
}

export default function VoltageCurrentGraph({
  data,
  currentVoltage,
  currentAmps,
  height = 160,
}: VoltageCurrentGraphProps) {
  const points = useMemo(() => data.slice(-50), [data]);

  const { minV, maxV, avgV } = useMemo(() => {
    const voltages = points.map((p) => p.voltage);
    voltages.push(currentVoltage);

    const minObs = Math.min(...voltages);
    const maxObs = Math.max(...voltages);
    const avg = voltages.reduce((a, b) => a + b, 0) / voltages.length;

    return {
      minV: Math.floor((minObs - 0.1) * 10) / 10,
      maxV: Math.ceil((maxObs + 0.1) * 10) / 10,
      avgV: Number(avg.toFixed(2)),
    };
  }, [points, currentVoltage]);

  const width = 800;
  const padTop = 15;
  const padBottom = 25;
  const plotH = height - padTop - padBottom;
  const vRange = maxV - minV || 0.5;

  const vLine = useMemo(() => {
    if (points.length < 2) return '';
    return points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * width;
        const y = padTop + plotH - ((p.voltage - minV) / vRange) * plotH;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points, minV, vRange, plotH, padTop, width]);

  const vArea = useMemo(() => {
    if (points.length < 2) return '';
    const bottomY = padTop + plotH;
    return `${vLine} L ${width} ${bottomY} L 0 ${bottomY} Z`;
  }, [vLine, plotH, padTop, width, points.length]);

  return (
    <div className="bg-[#1e1e22] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
            <h3 className="font-serif text-base text-white font-normal">Pack Voltage & Stability</h3>
          </div>
          <p className="text-[11px] font-mono text-neutral-400 mt-0.5">
            Realtime voltage fluctuation & continuous drift
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono">
          <div className="bg-sky-950/60 border border-sky-500/30 px-3 py-1 rounded-xl text-sky-300">
            <span className="text-sm sm:text-base font-bold">{currentVoltage.toFixed(2)} V</span>
            <span className="text-[10px] text-sky-400/80 ml-1.5">({currentAmps > 0 ? `+${currentAmps.toFixed(1)}` : currentAmps.toFixed(1)} A)</span>
          </div>
        </div>
      </div>

      <div className="relative w-full overflow-hidden bg-neutral-950/60 rounded-xl border border-white/5 p-2">
        {points.length < 2 ? (
          <div style={{ height }} className="flex items-center justify-center font-mono text-xs text-neutral-500">
            Waiting for stream data...
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            <defs>
              <linearGradient id="voltageAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Gridlines */}
            {[0, 0.33, 0.66, 1].map((pct) => {
              const y = padTop + plotH * pct;
              return (
                <line
                  key={pct}
                  x1={0}
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.04)"
                  strokeDasharray="4 4"
                />
              );
            })}

            {/* Area Fill */}
            <path d={vArea} fill="url(#voltageAreaGrad)" />

            {/* Line */}
            <path
              d={vLine}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Latest point circle */}
            <circle
              cx={width}
              cy={padTop + plotH - ((currentVoltage - minV) / vRange) * plotH}
              r="4"
              fill="#38bdf8"
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          </svg>
        )}

        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 mt-2 px-1">
          <span>Min: {minV.toFixed(2)}V</span>
          <span>Avg: {avgV.toFixed(2)}V</span>
          <span>Max: {maxV.toFixed(2)}V</span>
        </div>
      </div>
    </div>
  );
}

