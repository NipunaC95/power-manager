import React, { useRef, useState } from 'react';
import { formatTime } from '../utils/format';

export interface ChartProps<T = any> {
  title: string;
  data: T[];
  getValue: (item: T) => number | null | undefined;
  unit: string;
  color?: string;
  fillColor?: string;
  decimals?: number;
  selectedIndex?: number | null;
  onSelectIndex?: (index: number | null) => void;
  powerValue?: number | null;
}

export default function Chart<T extends { timestamp?: string; total_voltage?: number; current?: number }>({
  title,
  data,
  getValue,
  unit,
  color = '#3b82f6',
  fillColor = 'rgba(59, 130, 246, 0.06)',
  decimals = 1,
  selectedIndex: controlledIndex,
  onSelectIndex: setControlledIndex,
  powerValue: explicitPowerValue,
}: ChartProps<T>) {
  // Independent selection state per chart when not externally controlled
  const [internalIndex, setInternalIndex] = useState<number | null>(null);
  const selectedIndex = controlledIndex !== undefined ? controlledIndex : internalIndex;
  const onSelectIndex = setControlledIndex || setInternalIndex;

  const svgRef = useRef<SVGSVGElement | null>(null);

  const values = data.map(getValue).filter((v): v is number => v != null && isFinite(v));
  if (values.length < 2) return null;

  const timestamps = data
    .filter((d) => {
      const v = getValue(d);
      return v != null && isFinite(v);
    })
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

  // Selected point calculation
  const hasSelection = selectedIndex != null && selectedIndex >= 0 && selectedIndex < values.length;
  const activeValue = hasSelection ? values[selectedIndex] : latest;
  const activePoint = hasSelection ? points[selectedIndex] : null;
  const activeTimestamp = hasSelection ? timestamps[selectedIndex] : null;

  // Compute power for the selected snapshot independently
  const activeRecord = hasSelection ? data[selectedIndex] : null;
  const computedPower =
    activeRecord && activeRecord.total_voltage != null && activeRecord.current != null
      ? activeRecord.total_voltage * activeRecord.current
      : null;
  const activePower = explicitPowerValue !== undefined ? explicitPowerValue : computedPower;

  const handlePointerInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e && e.touches.length ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const idx = Math.round(ratio * (values.length - 1));

    // Toggle off if tapping already inspected point
    if (selectedIndex === idx) {
      onSelectIndex(null);
    } else {
      onSelectIndex(idx);
    }
  };

  return (
    <div className={`bg-[#1b1b1f] border rounded-sm p-4 flex flex-col justify-between transition-all ${
      hasSelection ? 'border-[#BF3C27]/50 shadow-sm ring-1 ring-[#BF3C27]/20' : 'border-white/10 hover:border-white/20'
    }`}>
      {/* Chart Header */}
      <div className="flex flex-col gap-2 pb-2 mb-3 border-b border-dashed border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
            <h3 className="font-serif text-sm text-neutral-100 font-normal">
              {title}
            </h3>
            {hasSelection && (
              <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-[#BF3C27]/20 text-[#BF3C27] font-semibold border border-[#BF3C27]/30 animate-pulse">
                INSPECT
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-base font-medium tabular-nums" style={{ color }}>
              {activeValue.toFixed(decimals)}
            </span>
            <span className="font-mono text-[11px] text-neutral-500">
              {unit}
            </span>
            {hasSelection && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectIndex(null);
                }}
                className="ml-2 font-mono text-[10px] text-neutral-400 hover:text-white px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-white/10 cursor-pointer"
                title="Reset inspection"
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>

        {/* Inspection Time & Power Readout Bar */}
        {hasSelection ? (
          <div className="flex items-center justify-between bg-neutral-900/90 px-2.5 py-1.5 rounded border border-white/10 font-mono text-xs text-neutral-300">
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-500 text-[10px] uppercase tracking-wider">Time:</span>
              <span className="text-white font-medium">{formatTime(activeTimestamp)}</span>
              <span className="text-neutral-600 text-[10px]">({activeTimestamp})</span>
            </div>
            {activePower != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-500 text-[10px] uppercase tracking-wider">Power:</span>
                <span className="text-[#e5933d] font-semibold tabular-nums">
                  {Number(activePower).toFixed(0)} W
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between font-mono text-[10px] text-neutral-500 px-0.5">
            <span>Range: {min.toFixed(decimals)}–{max.toFixed(decimals)} {unit}</span>
            <span className="text-neutral-600">Tap curve to inspect</span>
          </div>
        )}
      </div>

      {/* SVG Canvas with Interactive Cursor */}
      <div className="relative my-1">
        {/* Y-axis markers */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between pointer-events-none py-1">
          {gridLines.slice().reverse().map((g, i) => (
            <span key={i} className="font-mono text-[9px] text-neutral-500 tabular-nums">
              {g.label}
            </span>
          ))}
        </div>

        {/* Graph SVG */}
        <div
          className="ml-8 cursor-crosshair touch-none select-none"
          onClick={handlePointerInteraction}
          onTouchStart={handlePointerInteraction}
          onTouchMove={handlePointerInteraction}
          onMouseMove={(e) => {
            if (e.buttons === 1) handlePointerInteraction(e);
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-28 overflow-visible"
            preserveAspectRatio="none"
          >
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

            {/* Active inspection crosshair & dot */}
            {activePoint && (
              <g className="pointer-events-none">
                {/* Vertical cursor line */}
                <line
                  x1={activePoint.x}
                  y1={PAD_T}
                  x2={activePoint.x}
                  y2={PAD_T + plotH}
                  stroke="#BF3C27"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                  vectorEffect="non-scaling-stroke"
                />
                {/* Outer halo */}
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="5"
                  fill="#BF3C27"
                  fillOpacity="0.3"
                />
                {/* Center dot */}
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="3"
                  fill="#ffffff"
                  stroke="#BF3C27"
                  strokeWidth="1.5"
                />
              </g>
            )}
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
