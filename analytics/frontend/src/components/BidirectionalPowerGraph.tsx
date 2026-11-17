import React, { useMemo, useState, useRef } from 'react';
import { DataPoint } from './LiveStreamChart';
import { formatTime } from '../utils/format';

interface BidirectionalPowerGraphProps {
  data: DataPoint[];
  currentPower: number;
  currentAmps: number;
  height?: number;
}

export default function BidirectionalPowerGraph({
  data,
  currentPower,
  currentAmps,
  height = 200,
}: BidirectionalPowerGraphProps) {
  const points = useMemo(() => data.slice(-100), [data]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Compute power scale ensuring 0 W is cleanly framed
  const { minP, maxP, peakCharge, peakDischarge } = useMemo(() => {
    const powers = points.map((p) => p.power);
    powers.push(currentPower);

    const maxObserved = Math.max(0, ...powers);
    const minObserved = Math.min(0, ...powers);

    // Provide sensible margins around 0
    const topMargin = Math.max(100, Math.ceil(maxObserved * 1.25));
    const bottomMargin = Math.min(-100, Math.floor(minObserved * 1.25));

    return {
      minP: bottomMargin,
      maxP: topMargin,
      peakCharge: Number(maxObserved.toFixed(1)),
      peakDischarge: Number(Math.abs(minObserved).toFixed(1)),
    };
  }, [points, currentPower]);

  const width = 800;
  const padTop = 15;
  const padBottom = 25;
  const plotH = height - padTop - padBottom;
  const pRange = maxP - minP || 1;

  // Exact Y coordinate of the Zero Line (0 W)
  const zeroY = padTop + plotH - ((0 - minP) / pRange) * plotH;
  const zeroPct = Math.max(0, Math.min(100, ((zeroY - padTop) / plotH) * 100));

  // Point coordinates
  const svgPoints = useMemo(() => {
    if (points.length < 2) return [];
    return points.map((p, i) => ({
      x: (i / (points.length - 1)) * width,
      y: padTop + plotH - ((p.power - minP) / pRange) * plotH,
      power: p.power,
      timestamp: p.timestamp,
    }));
  }, [points, minP, pRange, plotH, padTop, width]);

  // Generate SVG path for Power line
  const pLine = useMemo(() => {
    if (svgPoints.length < 2) return '';
    return svgPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
  }, [svgPoints]);

  // Closed area path bound to zeroY
  const pArea = useMemo(() => {
    if (svgPoints.length < 2) return '';
    const firstX = 0;
    const lastX = width;
    return `${pLine} L ${lastX} ${zeroY.toFixed(1)} L ${firstX} ${zeroY.toFixed(1)} Z`;
  }, [pLine, zeroY, svgPoints.length, width]);

  // Handle pointer / tap inspection
  const handlePointerInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if (!svgRef.current || svgPoints.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e && e.touches.length ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const idx = Math.round(ratio * (svgPoints.length - 1));

    if (selectedIndex === idx) {
      setSelectedIndex(null);
    } else {
      setSelectedIndex(idx);
    }
  };

  const hasSelection = selectedIndex != null && selectedIndex >= 0 && selectedIndex < svgPoints.length;
  const activePoint = hasSelection ? svgPoints[selectedIndex] : null;
  const displayPower = hasSelection && activePoint ? activePoint.power : currentPower;
  const isCharging = displayPower > 1.0;
  const isDischarging = displayPower < -1.0;

  const firstTs = points.length > 0 ? formatTime(points[0].timestamp) : '';
  const lastTs = points.length > 0 ? formatTime(points[points.length - 1].timestamp) : '';

  return (
    <div className="bg-[#1e1e22] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-lg">
      {/* ── Top Header & Live Metric Badges ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <h3 className="font-serif text-base sm:text-lg text-white font-normal">Active Power Flow</h3>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/5 text-neutral-300 border border-white/10">
              Bidirectional (±W)
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-[11px] font-mono text-neutral-400">
              Realtime charge (+) and discharge (-) wattage with zero-center baseline
            </p>
            {hasSelection && (
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                Inspecting Point
              </span>
            )}
          </div>
        </div>

        {/* Big Live Digital Readout */}
        <div className="flex items-center gap-3">
          <div
            className={`px-3.5 py-1.5 rounded-xl border font-mono flex items-center gap-2.5 transition-all ${
              isCharging
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                : isDischarging
                ? 'bg-amber-950/70 border-amber-500/40 text-amber-300'
                : 'bg-neutral-900 border-white/10 text-neutral-300'
            }`}
          >
            <span className="text-lg">
              {isCharging ? '⚡' : isDischarging ? '🔋' : '⏸'}
            </span>
            <div>
              <div className="text-base sm:text-lg font-bold tracking-tight flex items-center gap-2">
                <span>
                  {displayPower > 0 ? `+${displayPower.toFixed(1)}` : displayPower.toFixed(1)}{' '}
                  <span className="text-xs font-normal">W</span>
                </span>
                {hasSelection && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIndex(null);
                    }}
                    className="text-[10px] font-mono text-neutral-400 hover:text-white px-1.5 py-0.5 rounded bg-neutral-800 border border-white/10 cursor-pointer"
                    title="Reset to live"
                  >
                    ✕ Live
                  </button>
                )}
              </div>
              <div className="text-[10px] opacity-80">
                {hasSelection && activePoint
                  ? `At ${formatTime(activePoint.timestamp, true)}`
                  : isCharging
                  ? `Charging @ +${currentAmps.toFixed(1)}A`
                  : isDischarging
                  ? `Discharging @ ${Math.abs(currentAmps).toFixed(1)}A`
                  : 'Float / Idle'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary Stats Pill Strip ── */}
      <div className="grid grid-cols-3 gap-2 mb-3 font-mono text-[11px]">
        <div className="bg-neutral-900/80 border border-white/5 rounded-lg px-2.5 py-1.5">
          <span className="text-[9px] text-neutral-400 uppercase block">Peak Charge</span>
          <span className="font-bold text-emerald-400">+{peakCharge} W</span>
        </div>
        <div className="bg-neutral-900/80 border border-white/5 rounded-lg px-2.5 py-1.5">
          <span className="text-[9px] text-neutral-400 uppercase block">Baseline Zero</span>
          <span className="font-bold text-white/90">0.0 W</span>
        </div>
        <div className="bg-neutral-900/80 border border-white/5 rounded-lg px-2.5 py-1.5">
          <span className="text-[9px] text-neutral-400 uppercase block">Peak Discharge</span>
          <span className="font-bold text-amber-400">-{peakDischarge} W</span>
        </div>
      </div>

      {/* ── Interactive SVG Bidirectional Graph ── */}
      <div
        className="relative w-full overflow-hidden bg-neutral-950/60 rounded-xl border border-white/5 p-2 cursor-crosshair touch-none select-none"
        onClick={handlePointerInteraction}
        onTouchStart={handlePointerInteraction}
        onTouchMove={handlePointerInteraction}
        onMouseMove={(e) => {
          if (e.buttons === 1) handlePointerInteraction(e);
        }}
      >
        {points.length < 2 ? (
          <div
            style={{ height }}
            className="flex items-center justify-center font-mono text-xs text-neutral-500"
          >
            Streaming live telemetry points...
          </div>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            <defs>
              {/* Green gradient for Charging (Above 0) */}
              <linearGradient id="chargeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
              </linearGradient>

              {/* Amber gradient for Discharging (Below 0) */}
              <linearGradient id="dischargeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.45" />
              </linearGradient>

              {/* Line Stroke Gradient (Green above zeroY, Amber below zeroY) */}
              <linearGradient id="powerLineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset={`${Math.max(0, zeroPct - 2)}%`} stopColor="#10b981" />
                <stop offset={`${Math.min(100, zeroPct + 2)}%`} stopColor="#f59e0b" />
              </linearGradient>

              {/* Clip rectangle for Charging area (above zero line) */}
              <clipPath id="clipAboveZero">
                <rect x="0" y="0" width={width} height={zeroY} />
              </clipPath>

              {/* Clip rectangle for Discharging area (below zero line) */}
              <clipPath id="clipBelowZero">
                <rect x="0" y={zeroY} width={width} height={height - zeroY} />
              </clipPath>
            </defs>

            {/* Horizontal Gridlines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
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

            {/* Charging Area Fill (Clipped Above Zero Line) */}
            <path d={pArea} fill="url(#chargeAreaGrad)" clipPath="url(#clipAboveZero)" />

            {/* Discharging Area Fill (Clipped Below Zero Line) */}
            <path d={pArea} fill="url(#dischargeAreaGrad)" clipPath="url(#clipBelowZero)" />

            {/* ── PROMINENT ZERO LINE (0 W) ── */}
            <line
              x1={0}
              y1={zeroY}
              x2={width}
              y2={zeroY}
              stroke="#ffffff"
              strokeOpacity="0.45"
              strokeWidth="1.8"
              strokeDasharray="6 4"
            />

            {/* Zero Line Label */}
            <rect
              x={width - 92}
              y={zeroY - 9}
              width={84}
              height={18}
              rx={4}
              fill="#18181b"
              stroke="rgba(255,255,255,0.2)"
            />
            <text
              x={width - 50}
              y={zeroY + 3.5}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize="10"
              fontWeight="bold"
              fontFamily="monospace"
            >
              0 W LINE
            </text>

            {/* Power Flow Curve */}
            <path
              d={pLine}
              fill="none"
              stroke="url(#powerLineGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Selected point crosshair & inspection marker */}
            {activePoint ? (
              <g className="pointer-events-none">
                <line
                  x1={activePoint.x}
                  y1={padTop}
                  x2={activePoint.x}
                  y2={padTop + plotH}
                  stroke={activePoint.power >= 0 ? '#10b981' : '#f59e0b'}
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="7"
                  fill={activePoint.power >= 0 ? '#10b981' : '#f59e0b'}
                  fillOpacity="0.25"
                />
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="4"
                  fill="#ffffff"
                  stroke={activePoint.power >= 0 ? '#10b981' : '#f59e0b'}
                  strokeWidth="2"
                />
              </g>
            ) : (
              /* Latest live point pulse */
              points.length > 0 && (
                <circle
                  cx={width}
                  cy={padTop + plotH - ((currentPower - minP) / pRange) * plotH}
                  r="4.5"
                  fill={currentPower >= 0 ? '#10b981' : '#f59e0b'}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  className="animate-pulse"
                />
              )
            )}
          </svg>
        )}

        {/* Graph Y-Axis Callouts */}
        <div className="absolute left-3 top-3 text-[10px] font-mono text-emerald-400 font-bold pointer-events-none">
          +{maxP.toFixed(0)}W (Charge)
        </div>
        <div className="absolute left-3 bottom-8 text-[10px] font-mono text-amber-400 font-bold pointer-events-none">
          {minP.toFixed(0)}W (Discharge)
        </div>

        {/* Floating Tooltip directly on clicked point */}
        {activePoint && (
          <div
            className="absolute pointer-events-none z-20 transition-all duration-75"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
              top: `${(activePoint.y / height) * 100}%`,
              transform: `translate(${
                activePoint.x > width * 0.72
                  ? '-100%'
                  : activePoint.x < width * 0.28
                  ? '0%'
                  : '-50%'
              }, ${activePoint.y < 40 ? '16px' : '-135%'})`,
            }}
          >
            <div className="bg-[#18181b]/95 border border-white/20 shadow-2xl rounded-lg px-2.5 py-1 font-mono backdrop-blur-sm whitespace-nowrap text-left ring-1 ring-black/50">
              <div
                className="flex items-center gap-1 text-xs font-bold tabular-nums"
                style={{ color: activePoint.power >= 0 ? '#34d399' : '#fbbf24' }}
              >
                <span>{activePoint.power > 0 ? `+${activePoint.power.toFixed(1)}` : activePoint.power.toFixed(1)}</span>
                <span className="text-[10px] text-neutral-400 font-normal">W</span>
              </div>
              <div className="text-[9px] text-neutral-400 mt-0.5">
                {formatTime(activePoint.timestamp, true)}
              </div>
            </div>
          </div>
        )}

        {/* ── X-Axis Timestamps Footer (matching other graphs) ── */}
        <div className="flex justify-between items-center font-mono text-[10px] text-neutral-400 pt-2 border-t border-white/5 mt-1 px-1">
          <span>{firstTs}</span>
          <span className="text-neutral-500">
            {hasSelection && activePoint
              ? `Tapped: ${formatTime(activePoint.timestamp, true)}`
              : `(${points.length} records)`}
          </span>
          <span>{lastTs}</span>
        </div>
      </div>
    </div>
  );
}
