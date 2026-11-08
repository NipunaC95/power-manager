import React, { useState, useEffect } from 'react';
import { useTelemetry } from './hooks/useTelemetry';
import { parseCells } from './utils/format';
import { loadSettings, calculateSoc, calculateCapacityRemaining, fetchSettingsApi } from './utils/soc';
import { BmsSettings, TelemetryData } from './types';

import Header from './components/Header';
import Metric from './components/Metric';
import Chart from './components/Chart';
import CellGrid from './components/CellGrid';
import CellDetail from './components/CellDetail';
import SwitchIndicator from './components/SwitchIndicator';
import Settings from './components/Settings';

export default function App() {
  const { latest, history, isWsConnected } = useTelemetry();
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settings, setSettings] = useState<BmsSettings>(loadSettings);

  // Sync settings from Cloudflare D1 on mount
  useEffect(() => {
    fetchSettingsApi().then((d) => {
      if (d) setSettings(d);
    });
  }, []);

  const val = (key: keyof TelemetryData) => latest?.[key] ?? null;
  const fmt = (key: keyof TelemetryData, d = 1): string => {
    const v = val(key);
    return v != null ? Number(v).toFixed(d) : '—';
  };

  const cells = parseCells(latest);
  const minV = cells.length ? Math.min(...cells) : null;
  const maxV = cells.length ? Math.max(...cells) : null;
  const cellDiffMv = minV != null && maxV != null ? ((maxV - minV) * 1000).toFixed(0) : '—';

  const current = val('current');
  const displaySoc = calculateSoc(latest, settings);
  const displayCapacity = calculateCapacityRemaining(latest, settings, displaySoc);

  const isCharging = current != null && Number(current) > 0.5;
  const isDischarging = current != null && Number(current) < -0.5;
  const isOnline = !!latest;

  const runtimeInfo = (() => {
    const cur = Number(current);
    if (!latest || isNaN(cur) || Math.abs(cur) < 0.1) {
      return isOnline ? 'Pack idle' : null;
    }
    if (cur < -0.1) {
      if (displayCapacity == null || displayCapacity <= 0) return null;
      const hours = displayCapacity / Math.abs(cur);
      if (!isFinite(hours) || hours <= 0) return null;
      const days = (hours / 24).toFixed(1);
      const str = hours > 24 ? `${hours.toFixed(0)}h (${days}d)` : hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(hours * 60)}m`;
      return `${str} remaining`;
    }
    if (cur > 0.1) {
      const ratedAh = Number(settings?.batteryCapacityAh) || 100;
      const neededAh = Math.max(0, ratedAh - (displayCapacity || 0));
      if (neededAh <= 0.1) return 'Fully charged';
      const hours = neededAh / cur;
      if (!isFinite(hours) || hours <= 0) return null;
      const str = hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(hours * 60)}m`;
      return `${str} to full`;
    }
    return null;
  })();

  return (
    <div className="max-w-5xl mx-auto bg-[#18181b]/95 border-x border-white/10 min-h-screen px-4 sm:px-8 py-6 flex flex-col justify-between shadow-2xl">
      <div>
        <Header
          latest={latest}
          isCharging={isCharging}
          isDischarging={isDischarging}
          isOnline={isOnline}
          isWsConnected={isWsConnected}
          onOpenSettings={() => setIsSettingsOpen(!isSettingsOpen)}
        />

        {/* Settings View */}
        {isSettingsOpen ? (
          <Settings
            settings={settings}
            onSave={(newSettings) => {
              setSettings(newSettings);
              setIsSettingsOpen(false);
            }}
            onBack={() => setIsSettingsOpen(false)}
            latest={latest}
          />
        ) : (
          <>
            {/* Section 1: Core Pack Telemetry */}
            <section className="mb-6">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-dashed border-white/10">
                <h2 className="font-serif text-sm text-neutral-300 font-normal">
                  Pack Overview
                </h2>
                <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-wider">
                  Realtime Bus
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric
                  label="State of Charge"
                  value={displaySoc ?? '—'}
                  unit="%"
                  large
                  color={displaySoc != null && displaySoc < 20 ? 'text-[#BF3C27]' : displaySoc != null && displaySoc > 80 ? 'text-emerald-400' : 'text-white'}
                  sub={settings.enableManualSoc ? 'Manual override applied' : (displaySoc != null && displaySoc > 90 ? 'Battery full capacity' : null)}
                />
                <Metric
                  label="Pack Voltage"
                  value={fmt('total_voltage', 2)}
                  unit="V"
                  large
                  color="text-white"
                />
                <Metric
                  label="Net Current"
                  value={fmt('current', 2)}
                  unit="A"
                  large
                  color={isCharging ? 'text-emerald-400' : isDischarging ? 'text-[#e5933d]' : 'text-neutral-300'}
                />
                <Metric
                  label="Active Power"
                  value={fmt('power', 0)}
                  unit="W"
                  large
                  color="text-[#e5933d]"
                />
              </div>
            </section>

            {/* Section 2: Diagnostics & Thermal */}
            <section className="mb-6">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-dashed border-white/10">
                <h2 className="font-serif text-sm text-neutral-300 font-normal">
                  Diagnostics &amp; Thermals
                </h2>
                <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-wider">
                  Health Monitor
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <Metric
                  label="Cell Delta"
                  value={cellDiffMv}
                  unit="mV"
                  color={cellDiffMv !== '—' && Number(cellDiffMv) > 30 ? 'text-[#BF3C27]' : 'text-neutral-200'}
                  sub={cellDiffMv !== '—' && Number(cellDiffMv) <= 15 ? 'Excellent balance' : null}
                />
                <Metric label="MOSFET Temp" value={fmt('temp_mos')} unit="°C" />
                <Metric label="Probe Temp 1" value={fmt('temp_battery_1')} unit="°C" />
                <Metric label="Probe Temp 2" value={fmt('temp_battery_2')} unit="°C" />
                <Metric
                  label="Capacity Left"
                  value={displayCapacity != null ? displayCapacity.toFixed(1) : '—'}
                  unit="Ah"
                  sub={runtimeInfo}
                />
              </div>
            </section>

            {/* Section 3: Cell Level Matrix or Detail View */}
            {selectedCell != null ? (
              <CellDetail
                cellIndex={selectedCell}
                cells={cells}
                history={history}
                onCellChange={setSelectedCell}
                onBack={() => setSelectedCell(null)}
              />
            ) : (
              <CellGrid cells={cells} minV={minV} maxV={maxV} onCellClick={setSelectedCell} />
            )}

            {/* Section 4: Telemetry History Charts (SOC, Voltage, Power) */}
            {history.length > 1 && (
              <section className="mb-6">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-dashed border-white/10">
                  <div className="flex items-center gap-2">
                    <h2 className="font-serif text-sm text-neutral-300 font-normal">
                      Temporal Telemetry
                    </h2>
                    {settings.enableManualSoc && (
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        SOC Override Active
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-wider">
                    Cloudflare D1 Log
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Chart 1: State of Charge (SOC) */}
                  <Chart
                    title="SOC History"
                    data={history}
                    getValue={(d) => calculateSoc(d, settings)}
                    unit="%"
                    color="#34d399"
                    fillColor="rgba(52, 211, 153, 0.06)"
                    decimals={0}
                  />

                  {/* Chart 2: Pack Voltage */}
                  <Chart
                    title="Voltage History"
                    data={history}
                    getValue={(d) => d.total_voltage}
                    unit="V"
                    color="#61afef"
                    fillColor="rgba(97, 175, 239, 0.06)"
                    decimals={2}
                  />

                  {/* Chart 3: Active Power */}
                  <Chart
                    title="Power History"
                    data={history}
                    getValue={(d) => (d.total_voltage != null && d.current != null ? d.total_voltage * d.current : null)}
                    unit="W"
                    color="#e5933d"
                    fillColor="rgba(229, 147, 61, 0.06)"
                    decimals={0}
                  />
                </div>
              </section>
            )}

            {/* Section 5: Switches / FET states */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <SwitchIndicator label="Charge FET" enabled={val('charging_enabled') === 1} />
              <SwitchIndicator label="Discharge FET" enabled={val('discharging_enabled') === 1} />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="pt-8 mt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-neutral-500 font-mono text-[11px]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#BF3C27]" />
          <span>JK-BMS Gateway</span>
          <span className="text-neutral-700">/</span>
          <span>ESP32 NimBLE</span>
        </div>
        <div>
          <span>Engineered with Cloudflare Workers &amp; D1</span>
        </div>
      </footer>
    </div>
  );
}
