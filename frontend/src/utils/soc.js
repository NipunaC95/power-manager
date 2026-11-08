/**
 * SOC (State of Charge) & Battery Settings Utility
 */

export const DEFAULT_SETTINGS = {
  batteryCapacityAh: 100,
  enableManualSoc: false,
  socMethod: 'lifepo4_curve', // 'lifepo4_curve' | 'voltage_range' | 'capacity_ratio'
  vMin: 24.0, // 0% SOC pack voltage (8S default)
  vMax: 27.2, // 100% SOC pack voltage (8S default)
  sohOverride: 100, // 100% default State of Health
};

export function loadSettings() {
  try {
    const saved = localStorage.getItem('jkbms_settings');
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch (e) {}
  return DEFAULT_SETTINGS;
}

export function saveSettingsLocal(settings) {
  try {
    localStorage.setItem('jkbms_settings', JSON.stringify(settings));
  } catch (e) {}
}

export async function fetchSettingsApi() {
  try {
    const resp = await fetch('/api/settings');
    if (resp.ok) {
      const data = await resp.json();
      if (data && typeof data === 'object') {
        const merged = { ...DEFAULT_SETTINGS, ...data };
        saveSettingsLocal(merged);
        return merged;
      }
    }
  } catch (e) {}
  return loadSettings();
}

export async function saveSettingsApi(settings) {
  saveSettingsLocal(settings);
  try {
    const resp = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (resp.ok) {
      const result = await resp.json();
      return result.settings || settings;
    }
  } catch (e) {}
  return settings;
}

export function calculateSoc(telemetry, settings) {
  if (!telemetry) return 0;
  if (!settings || !settings.enableManualSoc) {
    return telemetry.soc ?? 0;
  }

  const { socMethod, batteryCapacityAh, vMin, vMax } = settings;
  const voltage = Number(telemetry.total_voltage) || 0;

  let cells = [];
  if (Array.isArray(telemetry.cell_voltages)) {
    cells = telemetry.cell_voltages.map(Number);
  } else if (typeof telemetry.cell_voltages === 'string') {
    try { cells = JSON.parse(telemetry.cell_voltages).map(Number); } catch (e) {}
  }
  const cellCount = cells.length > 0 ? cells.length : (voltage > 35 ? 16 : 8);

  if (socMethod === 'capacity_ratio') {
    const rem = Number(telemetry.capacity_remaining) || 0;
    if (batteryCapacityAh > 0) {
      return Math.max(0, Math.min(100, Math.round((rem / batteryCapacityAh) * 100)));
    }
  }

  if (socMethod === 'voltage_range') {
    const range = (vMax || 27.2) - (vMin || 24.0);
    if (range <= 0) return 50;
    const pct = ((voltage - vMin) / range) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }

  // LiFePO4 resting OCV table interpolation
  const avgCellV = cells.length > 0
    ? cells.reduce((a, b) => a + b, 0) / cells.length
    : voltage / cellCount;

  const table = [
    { v: 3.42, soc: 100 },
    { v: 3.38, soc: 95 },
    { v: 3.35, soc: 90 },
    { v: 3.33, soc: 80 },
    { v: 3.31, soc: 70 },
    { v: 3.30, soc: 60 },
    { v: 3.29, soc: 50 },
    { v: 3.28, soc: 40 },
    { v: 3.26, soc: 30 },
    { v: 3.22, soc: 20 },
    { v: 3.15, soc: 10 },
    { v: 3.00, soc: 5 },
    { v: 2.80, soc: 0 },
  ];

  if (avgCellV >= table[0].v) return 100;
  if (avgCellV <= table[table.length - 1].v) return 0;

  for (let i = 0; i < table.length - 1; i++) {
    const high = table[i];
    const low = table[i + 1];
    if (avgCellV <= high.v && avgCellV >= low.v) {
      const frac = (avgCellV - low.v) / (high.v - low.v);
      return Math.round(low.soc + frac * (high.soc - low.soc));
    }
  }

  return Math.max(0, Math.min(100, Math.round(telemetry.soc ?? 0)));
}

/**
 * Calculate Capacity Remaining in Ah
 * When manual SOC override is active or when raw BMS capacity is 0 / uncalibrated,
 * calculates Ah remaining based on active SOC and configured battery capacity.
 */
export function calculateCapacityRemaining(telemetry, settings, displaySoc) {
  if (!telemetry) return 0;
  const rawCap = Number(telemetry.capacity_remaining);
  const ratedAh = Number(settings?.batteryCapacityAh) || 100;

  if (settings?.enableManualSoc || !rawCap || rawCap <= 0) {
    const soc = displaySoc != null ? displaySoc : calculateSoc(telemetry, settings);
    return Math.max(0, Math.min(ratedAh, (soc / 100) * ratedAh));
  }

  return rawCap;
}

/**
 * Calculate SOH (State of Health) %
 * Calculates pack health based on manual override setting or cell balance dispersion.
 */
export function calculateSoh(telemetry, settings) {
  if (!telemetry) return 100;

  // Custom user override in settings
  if (settings?.sohOverride != null && Number(settings.sohOverride) > 0) {
    return Math.min(100, Math.max(0, Math.round(Number(settings.sohOverride))));
  }

  // Automatic calculation based on cell voltage divergence
  let cells = [];
  if (Array.isArray(telemetry.cell_voltages)) {
    cells = telemetry.cell_voltages.map(Number);
  } else if (typeof telemetry.cell_voltages === 'string') {
    try { cells = JSON.parse(telemetry.cell_voltages).map(Number); } catch (e) {}
  }

  if (cells.length >= 2) {
    const deltaMv = (Math.max(...cells) - Math.min(...cells)) * 1000;
    if (deltaMv > 100) return Math.max(70, Math.round(100 - (deltaMv - 100) * 0.15));
    if (deltaMv > 50) return Math.max(90, Math.round(100 - (deltaMv - 50) * 0.2));
  }

  return 100;
}
