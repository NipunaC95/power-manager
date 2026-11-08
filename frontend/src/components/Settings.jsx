import React, { useState } from 'react';
import { DEFAULT_SETTINGS, calculateSoc, saveSettingsApi } from '../utils/soc.js';

export default function Settings({ settings, onSave, onBack, latest }) {
  const [form, setForm] = useState({ ...settings });
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const previewSoc = calculateSoc(latest, form);
  const rawSoc = latest?.soc ?? '—';

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSavedNotice(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const updated = await saveSettingsApi(form);
    setIsSaving(false);
    onSave(updated);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const handleReset = () => {
    setForm({ ...DEFAULT_SETTINGS });
    setSavedNotice(false);
  };

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-6 border-b border-dashed border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="zed-btn-neutral px-2.5 py-1 rounded text-xs font-mono text-neutral-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
          >
            <span>←</span>
            <span>Dashboard</span>
          </button>
          <div className="h-4 w-[1px] bg-white/10" />
          <h2 className="font-serif text-lg text-white font-normal flex items-center gap-2">
            <span>Battery Settings</span>
            <span className="italic text-neutral-400 font-serif font-light text-sm">&amp; SOC Overrides</span>
          </h2>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Live Preview Card */}
        <div className="bg-[#1b1b1f] border border-white/10 rounded-sm p-4">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-dashed border-white/10 font-mono text-[10px] text-neutral-400 uppercase tracking-wider">
            <span>Live Calculation Preview</span>
            <span className="text-neutral-500">Realtime Bus: {latest?.total_voltage ? `${latest.total_voltage.toFixed(2)} V` : '—'}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
            <div className="bg-neutral-900/80 p-3 rounded border border-white/5">
              <div className="text-[10px] text-neutral-500 uppercase mb-1">BMS Reported SOC</div>
              <div className="text-xl font-medium text-neutral-300">{rawSoc}%</div>
              <div className="text-[10px] text-neutral-600 mt-0.5">Raw from JK-BMS</div>
            </div>
            <div className={`p-3 rounded border ${
              form.enableManualSoc
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-neutral-900/80 border-white/5 text-neutral-400'
            }`}>
              <div className="text-[10px] uppercase mb-1">Active Dashboard SOC</div>
              <div className="text-xl font-semibold text-emerald-400">
                {form.enableManualSoc ? `${previewSoc}%` : `${rawSoc}%`}
              </div>
              <div className="text-[10px] mt-0.5">
                {form.enableManualSoc ? 'Manual Override Applied' : 'Using BMS Reported'}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1 bg-neutral-900/80 p-3 rounded border border-white/5">
              <div className="text-[10px] text-neutral-500 uppercase mb-1">Pack Capacity</div>
              <div className="text-xl font-medium text-white">{form.batteryCapacityAh} Ah</div>
              <div className="text-[10px] text-neutral-600 mt-0.5">Rated capacity setting</div>
            </div>
          </div>
        </div>

        {/* Setting 1: Battery Capacity */}
        <div className="bg-[#1b1b1f] border border-white/10 rounded-sm p-5 space-y-4">
          <div>
            <h3 className="font-serif text-base text-white font-normal mb-1">Rated Battery Capacity</h3>
            <p className="font-mono text-xs text-neutral-400">
              Total rated nominal storage capacity of your battery pack in Ampere-hours (Ah).
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative w-full sm:w-64">
              <input
                type="number"
                min="1"
                max="5000"
                step="1"
                value={form.batteryCapacityAh}
                onChange={(e) => handleChange('batteryCapacityAh', Number(e.target.value))}
                className="w-full bg-neutral-900 border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:border-white/30 focus:outline-none"
                placeholder="100"
                required
              />
              <span className="absolute right-3 top-2.5 font-mono text-xs text-neutral-500">Ah</span>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <span className="text-neutral-500 text-[10px] mr-1">Presets:</span>
              {[50, 100, 200, 280, 304].map((ah) => (
                <button
                  type="button"
                  key={ah}
                  onClick={() => handleChange('batteryCapacityAh', ah)}
                  className={`px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                    form.batteryCapacityAh === ah
                      ? 'zed-btn-rust text-white font-semibold'
                      : 'zed-btn-neutral text-neutral-300'
                  }`}
                >
                  {ah}Ah
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Setting 2: Manual SOC Calculation Override */}
        <div className="bg-[#1b1b1f] border border-white/10 rounded-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-base text-white font-normal mb-1">Manual SOC Calculation Override</h3>
              <p className="font-mono text-xs text-neutral-400">
                Override inaccurate or uncalibrated BMS percentage with mathematical estimation.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={form.enableManualSoc}
                onChange={(e) => handleChange('enableManualSoc', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#BF3C27]" />
            </label>
          </div>

          {form.enableManualSoc && (
            <div className="pt-4 border-t border-dashed border-white/10 space-y-4">
              {/* Method Selection */}
              <div>
                <label className="block font-mono text-xs uppercase tracking-wider text-neutral-400 mb-2">
                  Calculation Method
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => handleChange('socMethod', 'lifepo4_curve')}
                    className={`p-3 rounded text-left border transition-all cursor-pointer ${
                      form.socMethod === 'lifepo4_curve'
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                        : 'border-white/10 bg-neutral-900 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="font-semibold text-white mb-0.5">LiFePO4 Curve (Recommended)</div>
                    <div className="text-[10px] text-neutral-400">Non-linear open-circuit voltage table interpolation</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChange('socMethod', 'voltage_range')}
                    className={`p-3 rounded text-left border transition-all cursor-pointer ${
                      form.socMethod === 'voltage_range'
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                        : 'border-white/10 bg-neutral-900 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="font-semibold text-white mb-0.5">Voltage Range</div>
                    <div className="text-[10px] text-neutral-400">Linear scaling between Min (0%) and Max (100%) pack voltage</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChange('socMethod', 'capacity_ratio')}
                    className={`p-3 rounded text-left border transition-all cursor-pointer ${
                      form.socMethod === 'capacity_ratio'
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                        : 'border-white/10 bg-neutral-900 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="font-semibold text-white mb-0.5">Capacity Ratio</div>
                    <div className="text-[10px] text-neutral-400">Ratio of capacity remaining vs rated capacity</div>
                  </button>
                </div>
              </div>

              {/* Voltage Range Parameters */}
              {form.socMethod === 'voltage_range' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-neutral-900/60 p-4 rounded border border-white/5">
                  <div>
                    <label className="block font-mono text-xs text-neutral-400 mb-1">
                      Cutoff Voltage (0% SOC)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        value={form.vMin}
                        onChange={(e) => handleChange('vMin', Number(e.target.value))}
                        className="w-full bg-neutral-900 border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:border-white/30 focus:outline-none"
                      />
                      <span className="absolute right-3 top-2.5 font-mono text-xs text-neutral-500">V</span>
                    </div>
                    <span className="font-mono text-[10px] text-neutral-500 mt-1 block">Default: 24.0 V (8S) / 48.0 V (16S)</span>
                  </div>

                  <div>
                    <label className="block font-mono text-xs text-neutral-400 mb-1">
                      Full Voltage (100% SOC)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        value={form.vMax}
                        onChange={(e) => handleChange('vMax', Number(e.target.value))}
                        className="w-full bg-neutral-900 border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:border-white/30 focus:outline-none"
                      />
                      <span className="absolute right-3 top-2.5 font-mono text-xs text-neutral-500">V</span>
                    </div>
                    <span className="font-mono text-[10px] text-neutral-500 mt-1 block">Default: 27.2 V (8S) / 54.4 V (16S)</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleReset}
            className="zed-btn-neutral px-4 py-2 rounded text-xs font-mono text-neutral-300 hover:text-white cursor-pointer"
          >
            Reset Defaults
          </button>

          <div className="flex items-center gap-3">
            {savedNotice && (
              <span className="font-mono text-xs text-emerald-400 flex items-center gap-1">
                <span>✓</span> Saved to Cloudflare D1
              </span>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="zed-btn-rust px-6 py-2 rounded text-xs font-mono text-white font-semibold cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving to D1…' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
