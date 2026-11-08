/**
 * Type definitions for JK-BMS Telemetry & Dashboard
 */

export interface TelemetryData {
  id?: number;
  timestamp?: string;
  total_voltage: number;
  current: number;
  power?: number;
  soc: number;
  capacity_remaining: number;
  cell_min_voltage?: number;
  cell_max_voltage?: number;
  cell_diff?: number;
  temp_mos?: number;
  temp_battery_1?: number;
  temp_battery_2?: number;
  charging_enabled?: number | boolean;
  discharging_enabled?: number | boolean;
  cell_voltages?: number[] | string;
  [key: string]: any;
}

export type SocMethod = 'lifepo4_curve' | 'voltage_range' | 'capacity_ratio';

export interface BmsSettings {
  batteryCapacityAh: number;
  enableManualSoc: boolean;
  socMethod: SocMethod;
  vMin: number;
  vMax: number;
  sohOverride: number;
  updatedAt?: string;
}

export interface CellHistoryPoint {
  timestamp: string;
  voltage: number;
}
