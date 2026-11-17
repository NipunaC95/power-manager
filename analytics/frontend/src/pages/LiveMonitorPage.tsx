import React, { useState } from 'react';
import { useLiveSocket } from '../hooks/useLiveSocket';
import RadialGauge from '../components/RadialGauge';
import LiveStreamChart from '../components/LiveStreamChart';

export default function LiveMonitorPage() {
  const { telemetry, streamPoints, connectionStatus, latencyMs } = useLiveSocket();
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  const t = telemetry || {
    id: 0,
    timestamp: new Date().toISOString(),
    total_voltage: 25.65,
    current: -5.04,
    power: -129.3,
    soc: 85,
    capacity_remaining: 85.0,
    cell_min_voltage: 3.205,
    cell_max_voltage: 3.208,
    cell_diff: 0.003,
    temp_mos: 30.4,
    temp_battery_1: 28.8,
    temp_battery_2: 28.4,
    charging_enabled: 1,
    discharging_enabled: 1,
    cell_voltages: [3.206, 3.206, 3.206, 3.205, 3.207, 3.207, 3.208, 3.207],
  };

  const isCharging = t.current > 0.5;
  const isDischarging = t.current < -0.5;

  const cells = t.cell_voltages || [];
  const minV = t.cell_min_voltage || (cells.length ? Math.min(...cells) : 3.2);
  const maxV = t.cell_max_voltage || (cells.length ? Math.max(...cells) : 3.2);
  const deltaMv = t.cell_diff != null ? (t.cell_diff * 1000).toFixed(0) : '0';

  return (
    <div className="space-y-6">
      {/* ── Top Status Strip ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#1e1e22] border border-white/10 p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></span>
          <div>
            <span className="font-mono text-xs text-neutral-400">TARGET BMS:</span>
            <span className="font-mono text-sm text-white font-bold ml-2">507268D28101263</span>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          {/* Charging / Discharging badge */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-neutral-900 border border-white/10">
            <span
              className={`w-2 h-2 rounded-full ${
                isCharging
                  ? 'bg-emerald-400 animate-pulse'
                  : isDischarging
                  ? 'bg-amber-400'
                  : 'bg-neutral-500'
              }`}
            />
            <span className="text-white font-semibold">
              {isCharging ? 'CHARGING' : isDischarging ? 'DISCHARGING' : 'STANDBY'}
            </span>
          </div>

          {/* Connection status */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-neutral-900 border border-white/10">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'ws_live'
                  ? 'bg-emerald-400 animate-ping'
                  : connectionStatus === 'polling'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span className="text-neutral-300">
              {connectionStatus === 'ws_live'
                ? 'GCP WS LIVE'
                : connectionStatus === 'polling'
                ? `HTTP POLL (${latencyMs}ms)`
                : 'CONNECTING...'}
            </span>
          </div>
        </div>
      </div>

      {/* ── High-Tech Radial Gauges Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* SOC Radial Gauge */}
        <RadialGauge
          value={t.soc}
          min={0}
          max={100}
          unit="%"
          label="State of Charge"
          subtitle={`${t.capacity_remaining.toFixed(0)} Ah Rem`}
          size={145}
          decimals={0}
        />

        {/* Total Voltage Gauge */}
        <RadialGauge
          value={t.total_voltage}
          min={22.0}
          max={29.2}
          unit="V"
          label="Pack Voltage"
          subtitle={`Cell Δ: ${deltaMv} mV`}
          color="#38bdf8"
          size={145}
          decimals={2}
        />

        {/* Power Gauge */}
        <RadialGauge
          value={t.power}
          min={-1500}
          max={1500}
          unit="W"
          label="Active Power"
          subtitle={`${t.current.toFixed(1)} A`}
          size={145}
          decimals={0}
        />

        {/* MOSFET Temp Gauge */}
        <RadialGauge
          value={t.temp_mos}
          min={10}
          max={90}
          unit="°C"
          label="MOSFET Temp"
          subtitle={t.temp_mos < 50 ? 'Nominal' : 'Elevated'}
          color={t.temp_mos > 60 ? '#f43f5e' : '#10b981'}
          size={145}
          decimals={1}
        />

        {/* Battery Cell Temp Gauge */}
        <RadialGauge
          value={t.temp_battery_1}
          min={10}
          max={60}
          unit="°C"
          label="Battery Temp"
          subtitle={`T2: ${t.temp_battery_2.toFixed(1)}°C`}
          color="#a855f7"
          size={145}
          decimals={1}
        />
      </div>

      {/* ── Realtime Streaming Chart ── */}
      <LiveStreamChart data={streamPoints} height={200} />

      {/* ── Interactive 8-Cell Grid ── */}
      <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-serif text-lg text-white font-normal">Realtime Cell Voltages</h3>
            <p className="text-xs text-neutral-400 font-mono">
              8S LiFePO4 Balance &middot; Min: {minV.toFixed(3)}V &middot; Max: {maxV.toFixed(3)}V &middot; Spread: {deltaMv} mV
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="w-2 h-2 rounded bg-blue-400"></span> Min Cell
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="w-2 h-2 rounded bg-rose-400"></span> Max Cell
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {cells.map((v, i) => {
            const isMin = Math.abs(v - minV) < 0.0005;
            const isMax = Math.abs(v - maxV) < 0.0005;
            const pct = Math.min(Math.max(((v - 2.8) / (3.6 - 2.8)) * 100, 5), 100);

            return (
              <div
                key={i}
                onClick={() => setSelectedCell(i)}
                className={`p-3 rounded-lg border transition flex flex-col justify-between font-mono cursor-pointer ${
                  selectedCell === i
                    ? 'bg-neutral-800 border-white/40 ring-1 ring-white/40 shadow-lg'
                    : isMin
                    ? 'bg-blue-950/20 border-blue-500/40 hover:border-blue-400'
                    : isMax
                    ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-400'
                    : 'bg-neutral-900/60 border-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] mb-2">
                  <span className="text-neutral-400 font-bold">C{i + 1}</span>
                  {isMin && <span className="text-[9px] bg-blue-500/30 text-blue-300 px-1 rounded">MIN</span>}
                  {isMax && <span className="text-[9px] bg-rose-500/30 text-rose-300 px-1 rounded">MAX</span>}
                </div>

                <div className="text-base font-bold text-white tracking-tight my-1">
                  {v.toFixed(3)} <span className="text-[10px] font-normal text-neutral-400">V</span>
                </div>

                {/* Voltage Level Bar */}
                <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden mt-2">
                  <div
                    style={{ width: `${pct}%` }}
                    className={`h-full rounded-full transition-all duration-300 ${
                      isMin ? 'bg-blue-400' : isMax ? 'bg-rose-400' : 'bg-emerald-400'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Switch & Safety Status ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔌</span>
            <div>
              <span className="text-xs font-mono text-neutral-400">CHARGE MOSFET SWITCH</span>
              <p className="text-sm font-bold text-white font-mono">
                {t.charging_enabled ? 'ENABLED / ACTIVE' : 'DISABLED'}
              </p>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
            t.charging_enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
          }`}>
            {t.charging_enabled ? 'ON' : 'OFF'}
          </span>
        </div>

        <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <span className="text-xs font-mono text-neutral-400">DISCHARGE MOSFET SWITCH</span>
              <p className="text-sm font-bold text-white font-mono">
                {t.discharging_enabled ? 'ENABLED / ACTIVE' : 'DISABLED'}
              </p>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
            t.discharging_enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
          }`}>
            {t.discharging_enabled ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>
    </div>
  );
}
