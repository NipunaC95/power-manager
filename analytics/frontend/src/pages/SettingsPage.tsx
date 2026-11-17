import React, { useState, useEffect } from 'react';
import { calculateManualSoc } from '../utils/soc';

export default function SettingsPage() {
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncOutput, setSyncOutput] = useState<string | null>(null);

  // Battery settings state
  const [capacityAh, setCapacityAh] = useState<string>('130');
  const [nominalVoltage, setNominalVoltage] = useState<string>('25.6');
  const [cellCount, setCellCount] = useState<string>('8');

  // Manual SOC Override state
  const [enableManualSoc, setEnableManualSoc] = useState<boolean>(true);
  const [socMethod, setSocMethod] = useState<'lifepo4_curve' | 'voltage_range'>('lifepo4_curve');
  const [vMin, setVMin] = useState<string>('24.0');
  const [vMax, setVMax] = useState<string>('27.2');

  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStatusAndSettings = () => {
    fetch('/api/sync/status')
      .then((r) => r.json())
      .then((d) => setSyncStatus(d))
      .catch((err) => console.error(err));

    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.battery_capacity_ah) setCapacityAh(String(d.battery_capacity_ah));
        if (d.nominal_voltage) setNominalVoltage(String(d.nominal_voltage));
        if (d.cell_count) setCellCount(String(d.cell_count));
        if (d.enable_manual_soc !== undefined) setEnableManualSoc(Boolean(d.enable_manual_soc));
        if (d.soc_method) setSocMethod(d.soc_method);
        if (d.v_min) setVMin(String(d.v_min));
        if (d.v_max) setVMax(String(d.v_max));
      })
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    fetchStatusAndSettings();
  }, []);

  const handleForceSync = async () => {
    setIsSyncing(true);
    setSyncOutput('Triggering batch sync with primary server...');
    try {
      const res = await fetch('/api/analytics/sync', { method: 'POST' });
      const data = await res.json();
      setSyncOutput(JSON.stringify(data, null, 2));
      fetchStatusAndSettings();
    } catch (err: any) {
      setSyncOutput(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveFeedback(null);

    const cap = parseFloat(capacityAh);
    const volt = parseFloat(nominalVoltage);
    const cells = parseInt(cellCount, 10);
    const vMinNum = parseFloat(vMin);
    const vMaxNum = parseFloat(vMax);

    if (isNaN(cap) || cap <= 0) {
      setSaveFeedback({ type: 'error', message: 'Battery capacity must be a positive number.' });
      setIsSaving(false);
      return;
    }
    if (isNaN(volt) || volt <= 0) {
      setSaveFeedback({ type: 'error', message: 'Nominal voltage must be a positive number.' });
      setIsSaving(false);
      return;
    }
    if (isNaN(cells) || cells <= 0) {
      setSaveFeedback({ type: 'error', message: 'Cell count must be a positive integer.' });
      setIsSaving(false);
      return;
    }
    if (isNaN(vMinNum) || vMinNum <= 0) {
      setSaveFeedback({ type: 'error', message: 'V min must be a valid positive voltage.' });
      setIsSaving(false);
      return;
    }
    if (isNaN(vMaxNum) || vMaxNum <= vMinNum) {
      setSaveFeedback({ type: 'error', message: 'V max must be greater than V min.' });
      setIsSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battery_capacity_ah: cap,
          nominal_voltage: volt,
          cell_count: cells,
          enable_manual_soc: enableManualSoc,
          soc_method: socMethod,
          v_min: vMinNum,
          v_max: vMaxNum,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update settings');
      }

      setSaveFeedback({
        type: 'success',
        message: data.message || `Saved! Manual SOC override is ${enableManualSoc ? 'ACTIVE' : 'OFF'} with ${cap}Ah rating.`,
      });
      fetchStatusAndSettings();
    } catch (err: any) {
      setSaveFeedback({ type: 'error', message: err.message || 'Error updating settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  const capNum = parseFloat(capacityAh) || 0;
  const voltNum = parseFloat(nominalVoltage) || 0;
  const cellsNum = parseInt(cellCount, 10) || 8;
  const nominalEnergyKwh = ((capNum * voltNum) / 1000).toFixed(3);
  const nominalCellV = cellsNum > 0 ? (voltNum / cellsNum).toFixed(2) : '3.20';

  // Realtime preview of manual SOC for 25.5V pack voltage
  const simulatedV = 25.5;
  const previewSoc = calculateManualSoc(simulatedV, [], socMethod, parseFloat(vMin) || 24.0, parseFloat(vMax) || 27.2, cellsNum);
  const previewAh = ((previewSoc / 100) * capNum).toFixed(1);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-[#1e1e22] border border-white/10 p-5 rounded-2xl">
        <h2 className="font-serif text-xl text-white font-normal">System &amp; Battery Configuration</h2>
        <p className="text-xs text-neutral-400 font-mono mt-1">
          Battery pack specifications, manual SOC overrides &amp; cloud data synchronization
        </p>
      </div>

      {saveFeedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between transition-all ${
            saveFeedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{saveFeedback.type === 'success' ? '✓' : '⚠'}</span>
            <span>{saveFeedback.message}</span>
          </div>
          <button
            onClick={() => setSaveFeedback(null)}
            className="text-neutral-400 hover:text-white ml-2 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* ── 1. Manual State of Charge (SOC) Override Section ── */}
        <div className="bg-[#1e1e22] border border-white/10 rounded-2xl p-6 shadow-sm font-mono text-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">🔋</span>
                <h3 className="font-serif text-base text-white font-normal">
                  State of Charge (SOC) Manual Override
                </h3>
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">
                Calculate State of Charge from actual pack/cell voltage curves when the BMS raw data is inaccurate or stuck at 0%.
              </p>
            </div>

            {/* Toggle Button */}
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-bold ${enableManualSoc ? 'text-emerald-400' : 'text-neutral-500'}`}>
                {enableManualSoc ? 'OVERRIDE ON' : 'BMS RAW'}
              </span>
              <button
                type="button"
                onClick={() => setEnableManualSoc(!enableManualSoc)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                  enableManualSoc ? 'bg-[#BF3C27]' : 'bg-neutral-800 border border-white/10'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enableManualSoc ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {enableManualSoc && (
            <div className="space-y-5 animate-fadeIn">
              {/* Method Selector */}
              <div className="space-y-2">
                <label className="text-[11px] text-neutral-300 font-bold block uppercase tracking-wider">
                  Calculation Algorithm:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSocMethod('lifepo4_curve')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      socMethod === 'lifepo4_curve'
                        ? 'bg-[#BF3C27]/15 border-[#BF3C27] text-white shadow-md'
                        : 'bg-neutral-900/60 border-white/5 text-neutral-400 hover:text-white hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-white">LiFePO4 OCV Curve (Recommended)</span>
                      {socMethod === 'lifepo4_curve' && <span className="text-emerald-400 text-xs">✓ Active</span>}
                    </div>
                    <p className="text-[10px] text-neutral-400 leading-relaxed font-sans">
                      Non-linear 11-point resting voltage curve for 3.2V LiFePO4 cells. Accounts for the flat discharge plateau.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSocMethod('voltage_range')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      socMethod === 'voltage_range'
                        ? 'bg-[#BF3C27]/15 border-[#BF3C27] text-white shadow-md'
                        : 'bg-neutral-900/60 border-white/5 text-neutral-400 hover:text-white hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-white">Linear Voltage Window</span>
                      {socMethod === 'voltage_range' && <span className="text-emerald-400 text-xs">✓ Active</span>}
                    </div>
                    <p className="text-[10px] text-neutral-400 leading-relaxed font-sans">
                      Simple linear interpolation between configured minimum cutoff voltage (0%) and maximum charge voltage (100%).
                    </p>
                  </button>
                </div>
              </div>

              {/* Voltage Boundaries */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-neutral-300 font-bold block">
                    MINIMUM CUTOFF VOLTAGE (0% SOC) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="15.0"
                      max="40.0"
                      value={vMin}
                      onChange={(e) => setVMin(e.target.value)}
                      className="w-full bg-neutral-900 border border-white/15 focus:border-[#BF3C27] focus:ring-1 focus:ring-[#BF3C27] rounded-lg px-3 py-2 text-white font-bold text-sm outline-none transition"
                      placeholder="e.g. 24.0"
                      required
                    />
                    <span className="absolute right-3 top-2.5 text-neutral-400 text-xs font-bold pointer-events-none">
                      V ({(parseFloat(vMin) / cellsNum || 3.0).toFixed(2)}V/cell)
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-400">Standard 8S empty cutoff: 24.0V (3.00V/cell)</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-neutral-300 font-bold block">
                    MAXIMUM FULL VOLTAGE (100% SOC) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="20.0"
                      max="45.0"
                      value={vMax}
                      onChange={(e) => setVMax(e.target.value)}
                      className="w-full bg-neutral-900 border border-white/15 focus:border-[#BF3C27] focus:ring-1 focus:ring-[#BF3C27] rounded-lg px-3 py-2 text-white font-bold text-sm outline-none transition"
                      placeholder="e.g. 27.2"
                      required
                    />
                    <span className="absolute right-3 top-2.5 text-neutral-400 text-xs font-bold pointer-events-none">
                      V ({(parseFloat(vMax) / cellsNum || 3.4).toFixed(2)}V/cell)
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-400">Standard 8S full charge: 27.2V - 28.0V (3.40V - 3.50V/cell)</p>
                </div>
              </div>

              {/* Realtime Live Verification Simulator Card */}
              <div className="bg-neutral-900/80 border border-emerald-500/20 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400 font-bold uppercase tracking-wider text-[10px]">
                    Live Calculation Preview:
                  </span>
                  <span className="text-emerald-400 font-bold">Pack Voltage: {simulatedV.toFixed(2)}V (3.188 V/cell)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
                  <div className="bg-neutral-950 p-2.5 rounded-lg border border-white/5">
                    <span className="text-[9px] text-neutral-400 block mb-0.5">MANUALLY CALCULATED SOC</span>
                    <span className="text-lg font-bold text-emerald-400">{previewSoc}%</span>
                    <span className="text-[9px] text-neutral-500 block">({previewAh} Ah of {capNum}Ah)</span>
                  </div>
                  <div className="bg-neutral-950 p-2.5 rounded-lg border border-white/5">
                    <span className="text-[9px] text-neutral-400 block mb-0.5">RAW BMS VALUE (FAULTY)</span>
                    <span className="text-lg font-bold text-rose-400">0%</span>
                    <span className="text-[9px] text-rose-500/80 block">Uncalibrated / Drifting</span>
                  </div>
                  <div className="bg-neutral-950 p-2.5 rounded-lg border border-white/5">
                    <span className="text-[9px] text-neutral-400 block mb-0.5">OVERRIDE STATUS</span>
                    <span className="text-xs font-bold text-sky-400 block mt-1">ACTIVE CORRECTION</span>
                    <span className="text-[9px] text-neutral-400 block">Replaces 0% with {previewSoc}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 2. Battery Pack Specifications ── */}
        <div className="bg-[#1e1e22] border border-white/10 rounded-2xl p-6 shadow-sm font-mono text-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-4">
            <div>
              <h3 className="font-serif text-base text-white">Battery Pack Specifications</h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Used for Equivalent Full Cycles (EFC), Ah remaining, energy balance, and Coulomb efficiency.
              </p>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Cloud Persisted
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Battery Capacity */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-neutral-300 font-bold block">
                BATTERY CAPACITY (Ah) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="2000"
                  value={capacityAh}
                  onChange={(e) => setCapacityAh(e.target.value)}
                  className="w-full bg-neutral-900 border border-white/15 focus:border-[#BF3C27] focus:ring-1 focus:ring-[#BF3C27] rounded-lg px-3 py-2 text-white font-bold text-sm outline-none transition"
                  placeholder="e.g. 130"
                  required
                />
                <span className="absolute right-3 top-2.5 text-neutral-400 text-xs font-bold pointer-events-none">
                  Ah
                </span>
              </div>
              <p className="text-[10px] text-neutral-400">Nominal cell rating (e.g. 130Ah)</p>
            </div>

            {/* Nominal Voltage */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-neutral-300 font-bold block">
                NOMINAL VOLTAGE (V) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="500"
                  value={nominalVoltage}
                  onChange={(e) => setNominalVoltage(e.target.value)}
                  className="w-full bg-neutral-900 border border-white/15 focus:border-[#BF3C27] focus:ring-1 focus:ring-[#BF3C27] rounded-lg px-3 py-2 text-white font-bold text-sm outline-none transition"
                  placeholder="e.g. 25.6"
                  required
                />
                <span className="absolute right-3 top-2.5 text-neutral-400 text-xs font-bold pointer-events-none">
                  V
                </span>
              </div>
              <p className="text-[10px] text-neutral-400">8S LFP = 25.6V (3.2V/cell)</p>
            </div>

            {/* Series Cell Count */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-neutral-300 font-bold block">
                SERIES CELL COUNT (S) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="32"
                  value={cellCount}
                  onChange={(e) => setCellCount(e.target.value)}
                  className="w-full bg-neutral-900 border border-white/15 focus:border-[#BF3C27] focus:ring-1 focus:ring-[#BF3C27] rounded-lg px-3 py-2 text-white font-bold text-sm outline-none transition"
                  placeholder="e.g. 8"
                  required
                />
                <span className="absolute right-3 top-2.5 text-neutral-400 text-xs font-bold pointer-events-none">
                  Cells
                </span>
              </div>
              <p className="text-[10px] text-neutral-400">8 cells for 24V nominal</p>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="space-y-2">
            <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">
              Quick Capacity Presets:
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '100 Ah (Standard)', val: '100' },
                { label: '130 Ah (Active Pack)', val: '130' },
                { label: '200 Ah', val: '200' },
                { label: '280 Ah (High Cap)', val: '280' },
                { label: '304 Ah', val: '304' },
              ].map((p) => (
                <button
                  type="button"
                  key={p.val}
                  onClick={() => setCapacityAh(p.val)}
                  className={`px-2.5 py-1 rounded text-[11px] border transition cursor-pointer ${
                    capacityAh === p.val
                      ? 'bg-[#BF3C27]/20 border-[#BF3C27] text-white font-bold'
                      : 'bg-neutral-900/80 border-white/10 text-neutral-400 hover:text-white hover:border-white/20'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Derived Pack Metrics Live Display */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-neutral-900/60 rounded-xl border border-white/5">
            <div>
              <span className="text-[10px] text-neutral-400 block mb-0.5">NOMINAL PACK ENERGY</span>
              <span className="text-sm font-bold text-emerald-400">{nominalEnergyKwh} kWh</span>
              <span className="text-[9px] text-neutral-500 block">({capNum}Ah × {voltNum}V)</span>
            </div>
            <div>
              <span className="text-[10px] text-neutral-400 block mb-0.5">1 FULL CYCLE EQUIVALENT</span>
              <span className="text-sm font-bold text-white">{nominalEnergyKwh} kWh out</span>
              <span className="text-[9px] text-neutral-500 block">Energy throughput for 1 EFC</span>
            </div>
            <div>
              <span className="text-[10px] text-neutral-400 block mb-0.5">NOMINAL CELL VOLTAGE</span>
              <span className="text-sm font-bold text-neutral-200">{nominalCellV} V / cell</span>
              <span className="text-[9px] text-neutral-500 block">LiFePO4 Chemistry</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-[11px] text-neutral-500">
              * Saving will apply settings immediately across live monitoring, history, and cycles.
            </p>
            <button
              type="submit"
              disabled={isSaving}
              className="zed-btn-rust px-5 py-2.5 rounded-xl text-white font-mono text-xs flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
            >
              <span className={isSaving ? 'animate-spin' : ''}>{isSaving ? '⏳' : '💾'}</span>
              <span>{isSaving ? 'Saving & Applying...' : 'Save All Settings'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* ── 3. Cloud Data Synchronization ── */}
      <div className="bg-[#1e1e22] border border-white/10 rounded-2xl p-6 shadow-sm space-y-4 font-mono text-xs">
        <h3 className="font-serif text-base text-white">Cloud Data Synchronization</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-neutral-300">
          <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-[10px] text-neutral-400 block mb-1">PRIMARY SERVER HOST</span>
            <span className="text-white font-bold">{syncStatus?.target_server || 'http://136.80.228.184'}</span>
          </div>

          <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-[10px] text-neutral-400 block mb-1">SCHEDULED CRON FREQUENCY</span>
            <span className="text-emerald-400 font-bold">Every 1 Hour (0 * * * *)</span>
          </div>

          <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-[10px] text-neutral-400 block mb-1">LAST SYNCED RECORD ID</span>
            <span className="text-white font-bold">#{syncStatus?.last_synced_id ?? 0}</span>
          </div>

          <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-[10px] text-neutral-400 block mb-1">LAST SYNC TIMESTAMP</span>
            <span className="text-neutral-200">{syncStatus?.last_sync_time || 'Never'}</span>
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={handleForceSync}
            disabled={isSyncing}
            className="zed-btn-rust px-4 py-2 rounded-xl text-white font-mono text-xs flex items-center gap-2 cursor-pointer shadow disabled:opacity-50"
          >
            <span className={isSyncing ? 'animate-spin' : ''}>🔄</span>
            <span>{isSyncing ? 'Executing Sync...' : 'Trigger Immediate Sync Now'}</span>
          </button>
        </div>

        {syncOutput && (
          <pre className="bg-neutral-950 p-3 rounded-lg border border-white/10 text-[11px] text-emerald-300 overflow-x-auto">
            {syncOutput}
          </pre>
        )}
      </div>
    </div>
  );
}
