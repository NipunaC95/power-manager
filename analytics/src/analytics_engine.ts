import { SyncedRecord, HourlyRollup, DailyRollup, CellHealthSummary } from './types';

/**
 * Advanced Battery Analytics Calculation Engine
 */

export class AnalyticsEngine {
  /**
   * Numerically integrates power over time using the trapezoidal rule
   * Returns { kwhCharged, kwhDischarged, netKwh }
   */
  public static calculateEnergyThroughput(records: SyncedRecord[]): {
    kwhCharged: number;
    kwhDischarged: number;
    netKwh: number;
  } {
    if (records.length < 2) {
      return { kwhCharged: 0, kwhDischarged: 0, netKwh: 0 };
    }

    let kwhCharged = 0;
    let kwhDischarged = 0;

    for (let i = 0; i < records.length - 1; i++) {
      const r1 = records[i];
      const r2 = records[i + 1];

      const t1 = new Date(r1.timestamp).getTime();
      const t2 = new Date(r2.timestamp).getTime();
      const dtSeconds = (t2 - t1) / 1000;

      // Ignore large gaps (>10 minutes) where BMS might have been asleep or offline
      if (dtSeconds <= 0 || dtSeconds > 600) continue;

      const dtHours = dtSeconds / 3600;
      const p1 = r1.power; // Watts
      const p2 = r2.power;
      const avgPower = (p1 + p2) / 2;
      const energyKwh = (avgPower * dtHours) / 1000;

      if (avgPower > 0) {
        kwhCharged += energyKwh;
      } else if (avgPower < 0) {
        kwhDischarged += Math.abs(energyKwh);
      }
    }

    return {
      kwhCharged: Number(kwhCharged.toFixed(4)),
      kwhDischarged: Number(kwhDischarged.toFixed(4)),
      netKwh: Number((kwhCharged - kwhDischarged).toFixed(4)),
    };
  }

  /**
   * Identifies the weakest cell by analyzing voltage sag during discharge
   */
  public static analyzeCellHealth(records: SyncedRecord[]): {
    summaries: CellHealthSummary[];
    weakestCellIndex: number | null;
    maxPackDelta: number;
    avgPackDelta: number;
  } {
    if (!records.length) {
      return { summaries: [], weakestCellIndex: null, maxPackDelta: 0, avgPackDelta: 0 };
    }

    const cellCount = records[0].cell_voltages?.length || 0;
    if (cellCount === 0) {
      return { summaries: [], weakestCellIndex: null, maxPackDelta: 0, avgPackDelta: 0 };
    }

    // Accumulators per cell
    const cellSums = new Array(cellCount).fill(0);
    const cellMins = new Array(cellCount).fill(99.0);
    const cellMaxs = new Array(cellCount).fill(0.0);
    const cellSagScores = new Array(cellCount).fill(0); // Sag under discharge
    let dischargeSampleCount = 0;

    let totalDeltaSum = 0;
    let maxDelta = 0;

    for (const r of records) {
      const cells = r.cell_voltages;
      if (!cells || cells.length !== cellCount) continue;

      const minV = Math.min(...cells);
      const maxV = Math.max(...cells);
      const delta = maxV - minV;
      totalDeltaSum += delta;
      if (delta > maxDelta) maxDelta = delta;

      const meanV = cells.reduce((a, b) => a + b, 0) / cellCount;
      const isDischarging = r.current < -1.0;
      if (isDischarging) dischargeSampleCount++;

      for (let i = 0; i < cellCount; i++) {
        const v = cells[i];
        cellSums[i] += v;
        if (v < cellMins[i]) cellMins[i] = v;
        if (v > cellMaxs[i]) cellMaxs[i] = v;

        if (isDischarging) {
          // Negative means cell sags lower than pack average
          cellSagScores[i] += (v - meanV);
        }
      }
    }

    let weakestIdx: number | null = null;
    let worstSag = 999;

    const summaries: CellHealthSummary[] = [];
    for (let i = 0; i < cellCount; i++) {
      const avgV = cellSums[i] / records.length;
      const avgSag = dischargeSampleCount > 0 ? (cellSagScores[i] / dischargeSampleCount) : 0;
      const spread = cellMaxs[i] - cellMins[i];

      if (avgSag < worstSag) {
        worstSag = avgSag;
        weakestIdx = i;
      }

      let status: 'healthy' | 'caution' | 'imbalanced' = 'healthy';
      if (maxDelta > 0.050) {
        status = 'imbalanced';
      } else if (maxDelta > 0.025) {
        status = 'caution';
      }

      summaries.push({
        cell_index: i,
        avg_voltage: Number(avgV.toFixed(3)),
        min_voltage: Number(cellMins[i].toFixed(3)),
        max_voltage: Number(cellMaxs[i].toFixed(3)),
        avg_delta_from_mean: Number((avgSag * 1000).toFixed(1)), // in mV
        voltage_spread: Number((spread * 1000).toFixed(1)),       // in mV
        is_weakest: false,
        status,
      });
    }

    if (weakestIdx !== null && summaries[weakestIdx]) {
      summaries[weakestIdx].is_weakest = true;
    }

    return {
      summaries,
      weakestCellIndex: weakestIdx,
      maxPackDelta: Number(maxDelta.toFixed(3)),
      avgPackDelta: Number((totalDeltaSum / records.length).toFixed(3)),
    };
  }

  /**
   * Computes an overall Battery Health Score (0 - 100)
   */
  public static calculateHealthScore(
    maxCellDelta: number,
    highestTempMos: number,
    highestTempBat: number,
    coulombEfficiency: number
  ): number {
    let score = 100;

    // Cell Balance Penalty (LiFePO4 should be within 15-25mV)
    if (maxCellDelta > 0.100) {
      score -= 30; // Severe imbalance (>100mV)
    } else if (maxCellDelta > 0.050) {
      score -= 15; // Moderate imbalance (>50mV)
    } else if (maxCellDelta > 0.025) {
      score -= 5;
    }

    // Thermal Stress Penalty
    if (highestTempBat > 50) {
      score -= 25; // Critical battery heat
    } else if (highestTempBat > 42) {
      score -= 10;
    }

    if (highestTempMos > 75) {
      score -= 15; // High MOSFET temperature
    } else if (highestTempMos > 60) {
      score -= 5;
    }

    // Coulomb Efficiency Penalty
    if (coulombEfficiency < 85 && coulombEfficiency > 0) {
      score -= 10;
    }

    return Math.max(10, Math.min(100, Math.round(score)));
  }

  /**
   * Computes equivalent full battery cycles
   */
  public static calculateEquivalentCycles(
    kwhDischarged: number,
    capacityAh: number,
    nominalVoltage: number
  ): number {
    const packNominalKwh = (capacityAh * nominalVoltage) / 1000;
    if (packNominalKwh <= 0) return 0;
    return Number((kwhDischarged / packNominalKwh).toFixed(3));
  }
}
