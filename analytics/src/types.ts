export interface Env {
  DB: D1Database;
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
  PRIMARY_SERVER_URL?: string;
  SYNC_API_KEY?: string;
  NOMINAL_CAPACITY_AH?: string;
  NOMINAL_VOLTAGE?: string;
}

export interface SyncedRecord {
  id: number;
  timestamp: string;
  total_voltage: number;
  current: number;
  power: number;
  soc: number;
  capacity_remaining: number;
  cell_min_voltage: number | null;
  cell_max_voltage: number | null;
  cell_diff: number | null;
  temp_mos: number;
  temp_battery_1: number;
  temp_battery_2: number;
  charging_enabled: number;
  discharging_enabled: number;
  cell_voltages: number[];
}

export interface HourlyRollup {
  hour_bucket: string;
  date: string;
  record_count: number;
  kwh_charged: number;
  kwh_discharged: number;
  net_kwh: number;
  avg_voltage: number;
  min_voltage: number;
  max_voltage: number;
  avg_current: number;
  peak_charge_current: number;
  peak_discharge_current: number;
  avg_soc: number;
  min_soc: number;
  max_soc: number;
  max_cell_diff: number;
  avg_cell_diff: number;
  weakest_cell_index: number | null;
  max_temp_mos: number;
  max_temp_battery: number;
}

export interface DailyRollup {
  date: string;
  total_records: number;
  kwh_charged: number;
  kwh_discharged: number;
  net_kwh: number;
  coulomb_efficiency: number;
  equivalent_full_cycles: number;
  min_soc: number;
  max_soc: number;
  soc_swing: number;
  peak_charge_watts: number;
  peak_discharge_watts: number;
  max_cell_delta: number;
  weakest_cell_index: number | null;
  highest_temp_mos: number;
  highest_temp_bat: number;
  estimated_soh: number;
  health_score: number;
}

export interface CellHealthSummary {
  cell_index: number;
  avg_voltage: number;
  min_voltage: number;
  max_voltage: number;
  avg_delta_from_mean: number; // positive = higher than average, negative = lower (weak)
  voltage_spread: number;
  is_weakest: boolean;
  status: 'healthy' | 'caution' | 'imbalanced';
}
