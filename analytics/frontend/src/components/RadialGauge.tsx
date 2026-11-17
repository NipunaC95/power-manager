import React from 'react';

interface RadialGaugeProps {
  value: number;
  min: number;
  max: number;
  unit: string;
  label: string;
  subtitle?: string;
  color?: string;
  size?: number;
  decimals?: number;
}

export default function RadialGauge({
  value,
  min,
  max,
  unit,
  label,
  subtitle,
  color,
  size = 140,
  decimals = 1,
}: RadialGaugeProps) {
  const clampedValue = Math.min(Math.max(value, min), max);
  const percentage = (clampedValue - min) / (max - min);

  // SVG Arc geometry
  const strokeWidth = Math.max(8, Math.round(size * 0.08));
  const radius = (size - strokeWidth * 2) / 2;
  const center = size / 2;
  
  // 240 degree gauge arc (from -210 to +30 degrees)
  const arcLength = 2 * Math.PI * radius * (240 / 360);
  const strokeDashoffset = arcLength * (1 - percentage);

  // Dynamic color if not specified
  let gaugeColor = color;
  if (!gaugeColor) {
    if (label.includes('SOC')) {
      gaugeColor = value > 50 ? '#10b981' : value > 20 ? '#f59e0b' : '#f43f5e';
    } else if (label.includes('TEMP')) {
      gaugeColor = value > 60 ? '#f43f5e' : value > 45 ? '#f59e0b' : '#10b981';
    } else if (label.includes('POWER')) {
      gaugeColor = value < 0 ? '#f59e0b' : value > 0 ? '#10b981' : '#71717a';
    } else {
      gaugeColor = '#10b981';
    }
  }

  return (
    <div className="flex flex-col items-center justify-center p-3 bg-neutral-900/60 border border-white/5 rounded-xl shadow-sm">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size * 0.85 }}>
        <svg width={size} height={size} className="overflow-visible transform -rotate-[120deg]">
          {/* Background Track Arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} 9999`}
            strokeLinecap="round"
          />
          {/* Active Value Arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke={gaugeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} 9999`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        </svg>

        {/* Center Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
          <div className="flex items-baseline gap-0.5">
            <span className="font-mono text-xl sm:text-2xl font-bold text-white tracking-tight">
              {value != null ? value.toFixed(decimals) : '--'}
            </span>
            <span className="font-mono text-xs text-neutral-400 font-normal">{unit}</span>
          </div>
          {subtitle && (
            <span className="text-[10px] text-neutral-500 font-mono mt-0.5">{subtitle}</span>
          )}
        </div>
      </div>

      {/* Bottom Label */}
      <span className="font-mono text-[11px] font-medium text-neutral-400 uppercase tracking-wider mt-1 text-center">
        {label}
      </span>
    </div>
  );
}

