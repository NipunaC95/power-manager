/**
 * State of Charge (SOC) Manual Calculation Utility for LiFePO4
 */

export interface BatterySettings {
  battery_capacity_ah: number;
  nominal_voltage: number;
  cell_count: number;
  enable_manual_soc: boolean;
  soc_method: 'lifepo4_curve' | 'voltage_range';
  v_min: number;
  v_max: number;
}

export const DEFAULT_SETTINGS: BatterySettings = {
  battery_capacity_ah: 130,
  nominal_voltage: 25.6,
  cell_count: 8,
  enable_manual_soc: true, // Default to true as user requested manual calculation
  soc_method: 'lifepo4_curve',
  v_min: 24.0,
  v_max: 27.2,
};

// 11-point non-linear LiFePO4 resting OCV curve
export const LIFEPO4_OCV_TABLE = [
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

/**
 * Calculates SOC percentage from pack voltage and cell voltages
 */
export function calculateManualSoc(
  packVoltage: number,
  cellVoltages: number[] = [],
  method: 'lifepo4_curve' | 'voltage_range' = 'lifepo4_curve',
  vMin = 24.0,
  vMax = 27.2,
  cellCount = 8
): number {
  if (packVoltage <= 0) return 0;

  if (method === 'voltage_range') {
    const range = (vMax || 27.2) - (vMin || 24.0);
    if (range <= 0) return 50;
    const pct = ((packVoltage - vMin) / range) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }

  // LiFePO4 OCV Curve
  const effectiveCellCount = cellVoltages.length > 0 ? cellVoltages.length : (packVoltage > 35 ? 16 : cellCount || 8);
  const avgCellV = cellVoltages.length > 0
    ? cellVoltages.reduce((a, b) => a + b, 0) / cellVoltages.length
    : packVoltage / effectiveCellCount;

  if (avgCellV >= LIFEPO4_OCV_TABLE[0].v) return 100;
  if (avgCellV <= LIFEPO4_OCV_TABLE[LIFEPO4_OCV_TABLE.length - 1].v) return 0;

  for (let i = 0; i < LIFEPO4_OCV_TABLE.length - 1; i++) {
    const high = LIFEPO4_OCV_TABLE[i];
    const low = LIFEPO4_OCV_TABLE[i + 1];
    if (avgCellV <= high.v && avgCellV >= low.v) {
      const frac = (avgCellV - low.v) / (high.v - low.v);
      return Math.round(low.soc + frac * (high.soc - low.soc));
    }
  }

  return 50;
}

