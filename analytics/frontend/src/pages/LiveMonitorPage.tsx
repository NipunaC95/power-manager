import React, { useState, useEffect } from 'react';
import { useLiveSocket } from '../hooks/useLiveSocket';
import BidirectionalPowerGraph from '../components/BidirectionalPowerGraph';
import VoltageCurrentGraph from '../components/VoltageCurrentGraph';
import Chart from '../components/Chart';
import { calculateManualSoc, DEFAULT_SETTINGS, BatterySettings } from '../utils/soc';

export default function LiveMonitorPage() {
  const { telemetry, history, streamPoints, connectionStatus, latencyMs } = useLiveSocket();
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [settings, setSettings] = useState<BatterySettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d === 'object') {
          setSettings({
            battery_capacity_ah: d.battery_capacity_ah || 130,
            nominal_voltage: d.nominal_voltage || 25.6,
            cell_count: d.cell_count || 8,
            enable_manual_soc: d.enable_manual_soc !== undefined ? Boolean(d.enable_manual_soc) : true,
            soc_method: d.soc_method || 'lifepo4_curve',
            v_min: d.v_min || 24.0,
            v_max: d.v_max || 27.2,
          });
        }
      })
      .catch((err) => console.error('Could not fetch settings in LiveMonitor:', err));
  }, []);

  const t = telemetry || {
    id: 0,
    timestamp: new Date().toISOString(),
    total_voltage: 25.65,
    current: -5.04,
    power: -129.3,
    soc: 0,
    capacity_remaining: 0,
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

  // Manual SOC Calculation
  const totalCapacityAh = settings.battery_capacity_ah || 130.0;
  const calculatedSoc = calculateManualSoc(
    t.total_voltage,
    cells,
    settings.soc_method,
    settings.v_min,
    settings.v_max,
    settings.cell_count
  );

  const isManualActive = settings.enable_manual_soc || t.soc === 0;
  const effectiveSoc = isManualActive ? calculatedSoc : t.soc;
  const remainingAh = (effectiveSoc / 100) * totalCapacityAh;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Status Header Strip ── */}
      <div className="flex items-center justify-between bg-[#1e1e22] border border-white/10 px-4 py-3 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                connectionStatus === 'ws_live' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                connectionStatus === 'ws_live' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          </span>
          <div>
            <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block">
              Pack ID: 507268D28101263
            </span>
            <span className="text-xs font-bold text-white font-mono">
              {settings.cell_count}S LiFePO4 &middot; {totalCapacityAh}Ah
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
              isCharging
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : isDischarging
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                : 'bg-neutral-800 border-white/10 text-neutral-400'
            }`}
          >
            {isCharging ? '⚡ CHARGING' : isDischarging ? '🔋 DISCHARGING' : 'STANDBY'}
          </span>

          <span className="hidden sm:inline-block text-[10px] text-neutral-400 bg-neutral-900 border border-white/5 px-2 py-1 rounded-full">
            {connectionStatus === 'ws_live' ? 'STREAMING LIVE' : `POLLING (${latencyMs}ms)`}
          </span>
        </div>
      </div>

      {/* ── Mobile Battery SOC & Level Hero Card ── */}
      <div className="bg-[#1e1e22] border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
        {/* Subtle background glow */}
        <div
          className={`absolute -right-16 -top-16 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-20 ${
            effectiveSoc > 20 ? 'bg-emerald-500' : 'bg-rose-500'
          }`}
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
                State of Charge
              </span>
              {isManualActive && (
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
                  <span>⚡</span>
                  <span>Manual {settings.soc_method === 'lifepo4_curve' ? 'LiFePO4 Curve' : 'Linear Range'}</span>
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-4xl sm:text-5xl font-serif text-white font-light tracking-tight">
                {Math.round(effectiveSoc)}%
              </span>
              <span className="text-xs font-mono text-neutral-400">
                ({remainingAh.toFixed(1)} / {totalCapacityAh} Ah Remaining)
              </span>
            </div>

            {isManualActive && t.soc !== effectiveSoc && (
              <p className="text-[10px] font-mono text-neutral-500 mt-1">
                Raw BMS reported {t.soc}% (overridden by voltage curve)
              </p>
            )}
          </div>

          {/* Quick Metrics Capsule */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <div className="bg-neutral-900/90 border border-white/10 px-3 py-1.5 rounded-xl">
              <span className="text-[9px] text-neutral-400 block">PACK VOLTAGE</span>
              <span className="font-bold text-white text-sm">{t.total_voltage.toFixed(2)} V</span>
            </div>
            <div className="bg-neutral-900/90 border border-white/10 px-3 py-1.5 rounded-xl">
              <span className="text-[9px] text-neutral-400 block">CELL SPREAD</span>
              <span className="font-bold text-sky-400 text-sm">Δ {deltaMv} mV</span>
            </div>
          </div>
        </div>

        {/* Animated Horizontal Battery Capsule Gauge */}
        <div className="w-full h-4 bg-neutral-900/90 rounded-full overflow-hidden p-0.5 border border-white/10 relative">
          <div
            style={{ width: `${Math.min(100, Math.max(3, effectiveSoc))}%` }}
            className={`h-full rounded-full transition-all duration-500 ${
              effectiveSoc > 50
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                : effectiveSoc > 20
                ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                : 'bg-gradient-to-r from-rose-600 to-rose-400'
            }`}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 mt-2 px-0.5">
          <span>0% (Empty)</span>
          <span>50%</span>
          <span>100% (Full - {((totalCapacityAh * settings.nominal_voltage) / 1000).toFixed(2)} kWh)</span>
        </div>
      </div>

      {/* ── 1. Dedicated Bidirectional Power Graph with Zero Line ── */}
      <BidirectionalPowerGraph
        data={streamPoints}
        currentPower={t.power}
        currentAmps={t.current}
        height={210}
      />

      {/* ── 2. Temporal Telemetry (SOC History & Voltage History) ── */}
      {history.length > 1 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-dashed border-white/10">
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-sm sm:text-base text-neutral-200 font-normal">
                Temporal Telemetry
              </h2>
              {isManualActive && (
                <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  SOC Override Active
                </span>
              )}
            </div>
            <span className="font-mono text-[10px] text-neutral-400 uppercase tracking-wider">
              Telemetry History
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Chart 1: State of Charge (SOC) */}
            <Chart
              title="SOC History"
              data={history}
              getValue={(d) => {
                if (settings.enable_manual_soc || d.soc === 0) {
                  const cellsArr = Array.isArray(d.cell_voltages)
                    ? d.cell_voltages
                    : (typeof d.cell_voltages === 'string' ? JSON.parse(d.cell_voltages || '[]') : []);
                  return calculateManualSoc(
                    d.total_voltage,
                    cellsArr,
                    settings.soc_method,
                    settings.v_min,
                    settings.v_max,
                    settings.cell_count
                  );
                }
                return d.soc;
              }}
              unit="%"
              color="#34d399"
              fillColor="rgba(52, 211, 153, 0.08)"
              decimals={0}
            />

            {/* Chart 2: Pack Voltage */}
            <Chart
              title="Voltage History"
              data={history}
              getValue={(d) => d.total_voltage}
              unit="V"
              color="#61afef"
              fillColor="rgba(97, 175, 239, 0.08)"
              decimals={2}
            />
          </div>
        </section>
      )}

      {/* ── 2. Voltage & Stability Trend Graph ── */}
      <VoltageCurrentGraph
        data={streamPoints}
        currentVoltage={t.total_voltage}
        currentAmps={t.current}
        height={150}
      />

      {/* ── 3. Thermal Health Meters ── */}
      <div className="bg-[#1e1e22] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-serif text-base text-white font-normal">Thermal Temperatures</h3>
            <p className="text-[11px] font-mono text-neutral-400 mt-0.5">
              MOSFET and LiFePO4 cell temperature sensors
            </p>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Thermal Normal
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
          {/* MOSFET Temp */}
          <div className="bg-neutral-900/60 border border-white/5 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-neutral-400 font-bold">MOSFET SWITCH TEMP</span>
              <span className={`font-bold ${t.temp_mos > 60 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {t.temp_mos.toFixed(1)}°C
              </span>
            </div>
            <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div
                style={{ width: `${Math.min(100, (t.temp_mos / 80) * 100)}%` }}
                className={`h-full rounded-full ${t.temp_mos > 60 ? 'bg-rose-500' : 'bg-emerald-500'}`}
              />
            </div>
            <div className="flex justify-between text-[9px] text-neutral-500 mt-1">
              <span>0°C</span>
              <span>Warning: 65°C</span>
              <span>80°C</span>
            </div>
          </div>

          {/* Battery Cell Temp */}
          <div className="bg-neutral-900/60 border border-white/5 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-neutral-400 font-bold">BATTERY CELLS TEMP</span>
              <span className="font-bold text-purple-400">
                {t.temp_battery_1.toFixed(1)}°C <span className="text-[10px] text-neutral-400">/ {t.temp_battery_2.toFixed(1)}°C</span>
              </span>
            </div>
            <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div
                style={{ width: `${Math.min(100, (t.temp_battery_1 / 60) * 100)}%` }}
                className="h-full rounded-full bg-purple-500"
              />
            </div>
            <div className="flex justify-between text-[9px] text-neutral-500 mt-1">
              <span>0°C</span>
              <span>Max: 45°C</span>
              <span>60°C</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Interactive 8-Cell Voltage Balancer Grid ── */}
      <div className="bg-[#1e1e22] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-serif text-base text-white font-normal">Cell Voltage Balancing (8S)</h3>
            <p className="text-[11px] text-neutral-400 font-mono">
              Min: {minV.toFixed(3)}V &middot; Max: {maxV.toFixed(3)}V &middot; Spread: {deltaMv} mV
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="w-2 h-2 rounded bg-blue-400"></span> Min
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="w-2 h-2 rounded bg-rose-400"></span> Max
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {cells.map((v, i) => {
            const isMin = Math.abs(v - minV) < 0.0005;
            const isMax = Math.abs(v - maxV) < 0.0005;
            const pct = Math.min(Math.max(((v - 2.8) / (3.6 - 2.8)) * 100, 5), 100);

            return (
              <div
                key={i}
                onClick={() => setSelectedCell(i)}
                className={`p-3 rounded-xl border transition flex flex-col justify-between font-mono cursor-pointer ${
                  selectedCell === i
                    ? 'bg-neutral-800 border-white/40 ring-1 ring-white/40 shadow-lg'
                    : isMin
                    ? 'bg-blue-950/20 border-blue-500/40 hover:border-blue-400'
                    : isMax
                    ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-400'
                    : 'bg-neutral-900/60 border-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-neutral-400 font-bold">C{i + 1}</span>
                  {isMin && <span className="text-[8px] bg-blue-500/30 text-blue-300 px-1 rounded">MIN</span>}
                  {isMax && <span className="text-[8px] bg-rose-500/30 text-rose-300 px-1 rounded">MAX</span>}
                </div>

                <div className="text-sm sm:text-base font-bold text-white tracking-tight my-1">
                  {v.toFixed(3)} <span className="text-[10px] font-normal text-neutral-400">V</span>
                </div>

                <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden mt-1">
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

      {/* ── 5. Safety Switches ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-[#1e1e22] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔌</span>
            <div>
              <span className="text-[10px] font-mono text-neutral-400 uppercase">Charge Switch</span>
              <p className="text-xs sm:text-sm font-bold text-white font-mono">
                {t.charging_enabled ? 'ACTIVE / CHARGING' : 'DISABLED'}
              </p>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
            t.charging_enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
          }`}>
            {t.charging_enabled ? 'ON' : 'OFF'}
          </span>
        </div>

        <div className="bg-[#1e1e22] border border-white/10 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <span className="text-[10px] font-mono text-neutral-400 uppercase">Discharge Switch</span>
              <p className="text-xs sm:text-sm font-bold text-white font-mono">
                {t.discharging_enabled ? 'ACTIVE / DISCHARGING' : 'DISABLED'}
              </p>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
            t.discharging_enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
          }`}>
            {t.discharging_enabled ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>
    </div>
  );
}
