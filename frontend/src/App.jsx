import React, { useState } from 'react';
import { useTelemetry } from './hooks/useTelemetry.js';
import { parseCells } from './utils/format.js';

import Header from './components/Header.jsx';
import Metric from './components/Metric.jsx';
import Chart from './components/Chart.jsx';
import CellGrid from './components/CellGrid.jsx';
import CellDetail from './components/CellDetail.jsx';
import SwitchIndicator from './components/SwitchIndicator.jsx';

export default function App() {
  const { latest, history } = useTelemetry();
  const [selectedCell, setSelectedCell] = useState(null);

  const val = (key) => latest?.[key] ?? null;
  const fmt = (key, d = 1) => { const v = val(key); return v != null ? Number(v).toFixed(d) : '—'; };

  const cells = parseCells(latest);
  const minV = cells.length ? Math.min(...cells) : null;
  const maxV = cells.length ? Math.max(...cells) : null;
  const cellDiffMv = minV != null ? ((maxV - minV) * 1000).toFixed(0) : '—';

  const current = val('current');
  const soc = val('soc');
  const isCharging = current != null && Number(current) > 0.5;
  const isDischarging = current != null && Number(current) < -0.5;
  const isOnline = !!latest;

  const runtime = (() => {
    const cap = val('capacity_remaining');
    if (cap == null || current == null || Number(current) >= 0) return null;
    const h = Number(cap) / Math.abs(Number(current));
    if (h > 24) return `${(h / 24).toFixed(1)}d`;
    if (h >= 1) return `${h.toFixed(1)}h`;
    return `${(h * 60).toFixed(0)}m`;
  })();

  return (
    <div className="max-w-5xl mx-auto">
      <Header latest={latest} isCharging={isCharging} isDischarging={isDischarging} isOnline={isOnline} />

      {/* Primary metrics */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <Metric label="SOC" value={soc ?? '—'} unit="%" large
          color={soc != null && soc < 20 ? 'text-red-400' : soc != null && soc > 80 ? 'text-emerald-400' : 'text-white'} />
        <Metric label="Voltage" value={fmt('total_voltage', 2)} unit="V" large />
        <Metric label="Current" value={fmt('current', 2)} unit="A" large
          color={isCharging ? 'text-emerald-400' : isDischarging ? 'text-amber-400' : 'text-white'} />
        <Metric label="Power" value={fmt('power', 0)} unit="W" large />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <Metric label="Cell Δ" value={cellDiffMv} unit="mV"
          color={cellDiffMv !== '—' && Number(cellDiffMv) > 30 ? 'text-red-400' : 'text-slate-200'} />
        <Metric label="MOS Temp" value={fmt('temp_mos')} unit="°C" />
        <Metric label="Bat Temp 1" value={fmt('temp_battery_1')} unit="°C" />
        <Metric label="Bat Temp 2" value={fmt('temp_battery_2')} unit="°C" />
        <Metric label="Capacity" value={fmt('capacity_remaining', 1)} unit="Ah" sub={runtime ? `~${runtime} left` : null} />
      </div>

      {/* Cell detail or grid */}
      {selectedCell != null ? (
        <CellDetail cellIndex={selectedCell} cells={cells} history={history}
          onCellChange={setSelectedCell} onBack={() => setSelectedCell(null)} />
      ) : (
        <CellGrid cells={cells} minV={minV} maxV={maxV} onCellClick={setSelectedCell} />
      )}

      {/* Switches */}
      <div className="flex gap-3 mb-6">
        <SwitchIndicator label="Charge" enabled={val('charging_enabled') === 1} />
        <SwitchIndicator label="Discharge" enabled={val('discharging_enabled') === 1} />
      </div>

      {/* Charts */}
      {history.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Chart title="Voltage" data={history} getValue={(d) => d.total_voltage}
            unit="V" color="#60a5fa" fillColor="rgba(96,165,250,0.08)" decimals={2} />
          <Chart title="Power" data={history} getValue={(d) => d.total_voltage * d.current}
            unit="W" color="#fbbf24" fillColor="rgba(251,191,36,0.08)" decimals={0} />
        </div>
      )}
    </div>
  );
}
