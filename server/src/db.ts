import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface TelemetryPayload {
  total_voltage?: number;
  current?: number;
  soc?: number;
  capacity_remaining?: number;
  temp_mos?: number;
  temp_battery_1?: number;
  temp_battery_2?: number;
  charging_enabled?: number;
  discharging_enabled?: number;
  cell_voltages?: number[];
}

export interface EnrichedTelemetry {
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

export class BmsDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const finalPath = dbPath || process.env.DB_PATH || path.resolve(process.cwd(), 'data/jkbms.db');
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(finalPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.initSchema();
  }

  private initSchema() {
    const candidates = [
      path.resolve(process.cwd(), 'schema.sql'),
      path.resolve(__dirname, '../schema.sql'),
      path.resolve(__dirname, '../../schema.sql'),
    ];
    let sql: string | null = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        sql = fs.readFileSync(c, 'utf8');
        break;
      }
    }
    if (sql) {
      this.db.exec(sql);
    } else {
      // Inline schema fallback
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS bms_telemetry (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp       DATETIME DEFAULT CURRENT_TIMESTAMP,
            total_voltage   REAL NOT NULL,
            current         REAL NOT NULL,
            soc             INTEGER NOT NULL,
            capacity_remaining REAL,
            temp_mos        REAL,
            temp_battery_1  REAL,
            temp_battery_2  REAL,
            charging_enabled  INTEGER DEFAULT 1,
            discharging_enabled INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS cell_data (
            telemetry_id INTEGER NOT NULL,
            cell_index   INTEGER NOT NULL,
            voltage      REAL    NOT NULL,
            PRIMARY KEY (telemetry_id, cell_index),
            FOREIGN KEY (telemetry_id) REFERENCES bms_telemetry(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON bms_telemetry(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_cell_telemetry ON cell_data(telemetry_id);
        CREATE TABLE IF NOT EXISTS bms_settings (
            id                  INTEGER PRIMARY KEY CHECK (id = 1),
            battery_capacity_ah REAL NOT NULL DEFAULT 100,
            enable_manual_soc   INTEGER NOT NULL DEFAULT 0,
            soc_method          TEXT NOT NULL DEFAULT 'lifepo4_curve',
            v_min               REAL NOT NULL DEFAULT 24.0,
            v_max               REAL NOT NULL DEFAULT 27.2,
            soh_override        REAL DEFAULT 100,
            updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO bms_settings (id, battery_capacity_ah, enable_manual_soc, soc_method, v_min, v_max, soh_override)
        VALUES (1, 100, 0, 'lifepo4_curve', 24.0, 27.2, 100);
      `);
    }
  }

  public insertTelemetry(payload: TelemetryPayload): { id: number; latest: EnrichedTelemetry } {
    const {
      total_voltage = 0,
      current = 0,
      soc = 0,
      capacity_remaining = 0,
      temp_mos = 0,
      temp_battery_1 = 0,
      temp_battery_2 = 0,
      charging_enabled = 1,
      discharging_enabled = 1,
      cell_voltages = [],
    } = payload;

    const insertPack = this.db.prepare(`
      INSERT INTO bms_telemetry (
        total_voltage, current, soc, capacity_remaining,
        temp_mos, temp_battery_1, temp_battery_2,
        charging_enabled, discharging_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertCell = this.db.prepare(`
      INSERT OR REPLACE INTO cell_data (telemetry_id, cell_index, voltage) VALUES (?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      const result = insertPack.run(
        total_voltage,
        current,
        soc,
        capacity_remaining,
        temp_mos,
        temp_battery_1,
        temp_battery_2,
        charging_enabled,
        discharging_enabled
      );
      const telemetryId = Number(result.lastInsertRowid);

      const cells = Array.isArray(cell_voltages) ? cell_voltages : [];
      for (let i = 0; i < cells.length; i++) {
        insertCell.run(telemetryId, i, Number(cells[i]));
      }
      return telemetryId;
    });

    const telemetryId = transaction();
    const latest = this.getLatestTelemetry()!;
    return { id: telemetryId, latest };
  }

  public getLatestTelemetry(): EnrichedTelemetry | null {
    const row = this.db.prepare(`
      SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT 1
    `).get() as any;

    if (!row) return null;

    const cellRows = this.db.prepare(`
      SELECT cell_index, voltage FROM cell_data WHERE telemetry_id = ? ORDER BY cell_index ASC
    `).all(row.id) as Array<{ cell_index: number; voltage: number }>;

    const cells = cellRows.map((c) => c.voltage);
    const power = row.total_voltage * row.current;
    const cell_min = cells.length ? Math.min(...cells) : null;
    const cell_max = cells.length ? Math.max(...cells) : null;
    const cell_diff = cell_min != null && cell_max != null ? cell_max - cell_min : null;

    return {
      id: row.id,
      timestamp: row.timestamp,
      total_voltage: row.total_voltage,
      current: row.current,
      power,
      soc: row.soc,
      capacity_remaining: row.capacity_remaining,
      temp_mos: row.temp_mos,
      temp_battery_1: row.temp_battery_1,
      temp_battery_2: row.temp_battery_2,
      charging_enabled: row.charging_enabled,
      discharging_enabled: row.discharging_enabled,
      cell_voltages: cells,
      cell_min_voltage: cell_min,
      cell_max_voltage: cell_max,
      cell_diff,
    };
  }

  public getHistoryTelemetry(limit = 100): any[] {
    const boundedLimit = Math.min(Math.max(limit, 1), 500);
    const rows = this.db.prepare(`
      SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT ?
    `).all(boundedLimit) as any[];

    if (!rows.length) return [];

    const telemetryIds = rows.map((r) => r.id);
    const placeholders = telemetryIds.map(() => '?').join(',');
    const cellRows = this.db.prepare(`
      SELECT telemetry_id, cell_index, voltage FROM cell_data WHERE telemetry_id IN (${placeholders}) ORDER BY telemetry_id, cell_index ASC
    `).all(...telemetryIds) as Array<{ telemetry_id: number; cell_index: number; voltage: number }>;

    const cellMap = new Map<number, number[]>();
    for (const c of cellRows) {
      if (!cellMap.has(c.telemetry_id)) cellMap.set(c.telemetry_id, []);
      cellMap.get(c.telemetry_id)!.push(c.voltage);
    }

    return rows.reverse().map((r) => {
      const cells = cellMap.get(r.id) || [];
      const cell_min = cells.length ? Math.min(...cells) : null;
      const cell_max = cells.length ? Math.max(...cells) : null;
      const cell_diff = cell_min != null && cell_max != null ? cell_max - cell_min : null;
      return {
        ...r,
        power: r.total_voltage * r.current,
        cell_voltages: cells,
        cell_min_voltage: cell_min,
        cell_max_voltage: cell_max,
        cell_diff,
      };
    });
  }

  public getCellHistory(cellIndex: number, limit = 200): any[] {
    const boundedLimit = Math.min(Math.max(limit, 1), 1000);
    const rows = this.db.prepare(`
      SELECT c.voltage, c.cell_index, t.timestamp, t.id as telemetry_id
      FROM cell_data c
      JOIN bms_telemetry t ON t.id = c.telemetry_id
      WHERE c.cell_index = ?
      ORDER BY t.timestamp DESC
      LIMIT ?
    `).all(cellIndex, boundedLimit) as any[];

    return rows.reverse();
  }

  public getLatestCells(limit = 50): any[] {
    const boundedLimit = Math.min(Math.max(limit, 1), 200);
    return this.db.prepare(`
      SELECT c.cell_index, c.voltage, t.timestamp, t.id as telemetry_id
      FROM cell_data c
      JOIN bms_telemetry t ON t.id = c.telemetry_id
      WHERE t.id IN (
        SELECT id FROM bms_telemetry ORDER BY timestamp DESC LIMIT ?
      )
      ORDER BY t.timestamp ASC, c.cell_index ASC
    `).all(boundedLimit) as any[];
  }

  public getSettings(): any {
    const row = this.db.prepare(`SELECT * FROM bms_settings WHERE id = 1`).get() as any;
    if (row) {
      return {
        batteryCapacityAh: row.battery_capacity_ah,
        enableManualSoc: row.enable_manual_soc === 1,
        socMethod: row.soc_method,
        vMin: row.v_min,
        vMax: row.v_max,
        sohOverride: row.soh_override != null ? row.soh_override : 100,
        updatedAt: row.updated_at,
      };
    }
    return {
      batteryCapacityAh: 100,
      enableManualSoc: false,
      socMethod: 'lifepo4_curve',
      vMin: 24.0,
      vMax: 27.2,
      sohOverride: 100,
    };
  }

  public updateSettings(body: any): any {
    const batteryCapacityAh = Number(body.batteryCapacityAh) || 100;
    const enableManualSoc = body.enableManualSoc ? 1 : 0;
    const socMethod = String(body.socMethod || 'lifepo4_curve');
    const vMin = Number(body.vMin) || 24.0;
    const vMax = Number(body.vMax) || 27.2;
    const sohOverride = Number(body.sohOverride) > 0 ? Number(body.sohOverride) : 100;

    this.db.prepare(`
      INSERT INTO bms_settings (id, battery_capacity_ah, enable_manual_soc, soc_method, v_min, v_max, soh_override, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        battery_capacity_ah = excluded.battery_capacity_ah,
        enable_manual_soc = excluded.enable_manual_soc,
        soc_method = excluded.soc_method,
        v_min = excluded.v_min,
        v_max = excluded.v_max,
        soh_override = excluded.soh_override,
        updated_at = CURRENT_TIMESTAMP
    `).run(batteryCapacityAh, enableManualSoc, socMethod, vMin, vMax, sohOverride);

    return {
      batteryCapacityAh,
      enableManualSoc: enableManualSoc === 1,
      socMethod,
      vMin,
      vMax,
      sohOverride,
    };
  }
}
