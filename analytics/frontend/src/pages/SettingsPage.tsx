import React, { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncOutput, setSyncOutput] = useState<string | null>(null);

  // Battery settings state
  const [capacityAh, setCapacityAh] = useState<string>('130');
  const [nominalVoltage, setNominalVoltage] = useState<string>('25.6');
  const [cellCount, setCellCount] = useState<string>('8');
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

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battery_capacity_ah: cap,
          nominal_voltage: volt,
          cell_count: cells,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update settings');
      }

      setSaveFeedback({
        type: 'success',
        message: data.message || `Saved! Battery capacity updated to ${cap}Ah. Historical cycles recalculated.`,
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

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-[#1e1e22] border border-white/10 p-5 rounded-2xl">
        <h2 className="font-serif text-xl text-white font-normal">System &amp; Battery Configuration</h2>
        <p className="text-xs text-neutral-400 font-mono mt-1">
          Battery pack specifications, cloud data synchronization &amp; pipeline diagnostics
        </p>
      </div>

      {/* ── Battery Pack Specifications (Editable) ── */}
      <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-6 shadow-sm font-mono text-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-4">
          <div>
            <h3 className="font-serif text-base text-white">Battery Pack Specifications</h3>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Used across all calculations: Equivalent Full Cycles (EFC), energy balance, Coulomb efficiency, and health diagnostics.
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            D1 Edge Persisted
          </span>
        </div>

        {saveFeedback && (
          <div
            className={`p-3.5 rounded-lg border text-xs flex items-center justify-between transition-all ${
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

        <form onSubmit={handleSaveSettings} className="space-y-5">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-neutral-900/60 rounded-lg border border-white/5">
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
              * Saving will automatically recalculate equivalent full cycles for all historical records.
            </p>
            <button
              type="submit"
              disabled={isSaving}
              className="zed-btn-rust px-5 py-2 rounded-lg text-white font-mono text-xs flex items-center gap-2 cursor-pointer shadow disabled:opacity-50"
            >
              <span className={isSaving ? 'animate-spin' : ''}>{isSaving ? '⏳' : '💾'}</span>
              <span>{isSaving ? 'Saving & Recalculating...' : 'Save Battery Settings'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ── Sync Pipeline Status ── */}
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
            className="zed-btn-rust px-4 py-2 rounded-lg text-white font-mono text-xs flex items-center gap-2 cursor-pointer shadow disabled:opacity-50"
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
