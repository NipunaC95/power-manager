import { Pool, PoolClient } from 'pg';
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
  private isPostgres: boolean;
  private pool: Pool | null = null;
  private sqliteDb: Database.Database | null = null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
      this.isPostgres = true;
      console.log('[DB] Connecting to PostgreSQL Database...');

      const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
      this.pool = new Pool({
        connectionString: databaseUrl,
        ssl: isLocal ? false : { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
      });

      this.initPostgresSchema().catch((err) => {
        console.error('[DB] Error initializing PostgreSQL schema:', err.message);
      });
    } else {
      this.isPostgres = false;
      const finalPath = process.env.DB_PATH || path.resolve(process.cwd(), 'data/jkbms.db');
      console.log(`[DB] No DATABASE_URL found. Using local SQLite at: ${finalPath}`);

      const dir = path.dirname(finalPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.sqliteDb = new Database(finalPath);
      this.sqliteDb.pragma('journal_mode = WAL');
      this.sqliteDb.pragma('synchronous = NORMAL');
      this.initSqliteSchema();
    }
  }

  private async initPostgresSchema() {
    if (!this.pool) return;
    const candidates = [
      path.resolve(process.cwd(), 'schema_pg.sql'),
      path.resolve(__dirname, '../schema_pg.sql'),
      path.resolve(__dirname, '../../schema_pg.sql'),
    ];
    let sql: string | null = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        sql = fs.readFileSync(c, 'utf8');
        break;
      }
    }
    if (sql) {
      await this.pool.query(sql);
      console.log('[DB] PostgreSQL schema initialized successfully.');
    }
  }

  private initSqliteSchema() {
    if (!this.sqliteDb) return;
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
      this.sqliteDb.exec(sql);
    }
  }

  public async insertTelemetry(payload: TelemetryPayload): Promise<{ id: number; latest: EnrichedTelemetry }> {
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

    const cells = Array.isArray(cell_voltages) ? cell_voltages : [];

    if (this.isPostgres && this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const insertRes = await client.query(`
          INSERT INTO bms_telemetry (
            total_voltage, current, soc, capacity_remaining,
            temp_mos, temp_battery_1, temp_battery_2,
            charging_enabled, discharging_enabled
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `, [
          total_voltage, current, soc, capacity_remaining,
          temp_mos, temp_battery_1, temp_battery_2,
          charging_enabled, discharging_enabled
        ]);

        const telemetryId = insertRes.rows[0].id;

        for (let i = 0; i < cells.length; i++) {
          await client.query(`
            INSERT INTO cell_data (telemetry_id, cell_index, voltage)
            VALUES ($1, $2, $3)
            ON CONFLICT (telemetry_id, cell_index) DO UPDATE SET voltage = EXCLUDED.voltage
          `, [telemetryId, i, Number(cells[i])]);
        }

        await client.query('COMMIT');
        const latest = (await this.getLatestTelemetry())!;
        return { id: telemetryId, latest };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // SQLite fallback
    const insertPack = this.sqliteDb!.prepare(`
      INSERT INTO bms_telemetry (
        total_voltage, current, soc, capacity_remaining,
        temp_mos, temp_battery_1, temp_battery_2,
        charging_enabled, discharging_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertCell = this.sqliteDb!.prepare(`
      INSERT OR REPLACE INTO cell_data (telemetry_id, cell_index, voltage) VALUES (?, ?, ?)
    `);

    const transaction = this.sqliteDb!.transaction(() => {
      const result = insertPack.run(
        total_voltage, current, soc, capacity_remaining,
        temp_mos, temp_battery_1, temp_battery_2,
        charging_enabled, discharging_enabled
      );
      const telemetryId = Number(result.lastInsertRowid);
      for (let i = 0; i < cells.length; i++) {
        insertCell.run(telemetryId, i, Number(cells[i]));
      }
      return telemetryId;
    });

    const telemetryId = transaction();
    const latest = (await this.getLatestTelemetry())!;
    return { id: telemetryId, latest };
  }

  public async getLatestTelemetry(): Promise<EnrichedTelemetry | null> {
    if (this.isPostgres && this.pool) {
      const res = await this.pool.query(`
        SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT 1
      `);
      if (!res.rows.length) return null;
      const row = res.rows[0];

      const cellRes = await this.pool.query(`
        SELECT cell_index, voltage FROM cell_data WHERE telemetry_id = $1 ORDER BY cell_index ASC
      `, [row.id]);

      const cells = cellRes.rows.map((c: any) => Number(c.voltage));
      const totalV = Number(row.total_voltage);
      const curr = Number(row.current);
      const power = totalV * curr;
      const cell_min = cells.length ? Math.min(...cells) : null;
      const cell_max = cells.length ? Math.max(...cells) : null;
      const cell_diff = cell_min != null && cell_max != null ? cell_max - cell_min : null;

      return {
        id: row.id,
        timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
        total_voltage: totalV,
        current: curr,
        power,
        soc: row.soc,
        capacity_remaining: Number(row.capacity_remaining),
        temp_mos: Number(row.temp_mos),
        temp_battery_1: Number(row.temp_battery_1),
        temp_battery_2: Number(row.temp_battery_2),
        charging_enabled: row.charging_enabled,
        discharging_enabled: row.discharging_enabled,
        cell_voltages: cells,
        cell_min_voltage: cell_min,
        cell_max_voltage: cell_max,
        cell_diff,
      };
    }

    // SQLite fallback
    const row = this.sqliteDb!.prepare(`
      SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT 1
    `).get() as any;

    if (!row) return null;

    const cellRows = this.sqliteDb!.prepare(`
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

  public async getHistoryTelemetry(limit = 100): Promise<any[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 500);

    if (this.isPostgres && this.pool) {
      const res = await this.pool.query(`
        SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT $1
      `, [boundedLimit]);

      if (!res.rows.length) return [];
      const rows = res.rows;
      const telemetryIds = rows.map((r: any) => r.id);

      const cellRes = await this.pool.query(`
        SELECT telemetry_id, cell_index, voltage FROM cell_data
        WHERE telemetry_id = ANY($1)
        ORDER BY telemetry_id, cell_index ASC
      `, [telemetryIds]);

      const cellMap = new Map<number, number[]>();
      for (const c of cellRes.rows) {
        if (!cellMap.has(c.telemetry_id)) cellMap.set(c.telemetry_id, []);
        cellMap.get(c.telemetry_id)!.push(Number(c.voltage));
      }

      return rows.reverse().map((r: any) => {
        const cells = cellMap.get(r.id) || [];
        const totalV = Number(r.total_voltage);
        const curr = Number(r.current);
        const cell_min = cells.length ? Math.min(...cells) : null;
        const cell_max = cells.length ? Math.max(...cells) : null;
        const cell_diff = cell_min != null && cell_max != null ? cell_max - cell_min : null;
        return {
          id: r.id,
          timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
          total_voltage: totalV,
          current: curr,
          power: totalV * curr,
          soc: r.soc,
          capacity_remaining: Number(r.capacity_remaining),
          temp_mos: Number(r.temp_mos),
          temp_battery_1: Number(r.temp_battery_1),
          temp_battery_2: Number(r.temp_battery_2),
          charging_enabled: r.charging_enabled,
          discharging_enabled: r.discharging_enabled,
          cell_voltages: cells,
          cell_min_voltage: cell_min,
          cell_max_voltage: cell_max,
          cell_diff,
        };
      });
    }

    // SQLite fallback
    const rows = this.sqliteDb!.prepare(`
      SELECT * FROM bms_telemetry ORDER BY timestamp DESC LIMIT ?
    `).all(boundedLimit) as any[];

    if (!rows.length) return [];

    const telemetryIds = rows.map((r) => r.id);
    const placeholders = telemetryIds.map(() => '?').join(',');
    const cellRows = this.sqliteDb!.prepare(`
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

  public async getSyncRecords(sinceId = 0, limit = 1000): Promise<EnrichedTelemetry[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 2000);

    if (this.isPostgres && this.pool) {
      const res = await this.pool.query(`
        SELECT * FROM bms_telemetry WHERE id > $1 ORDER BY id ASC LIMIT $2
      `, [sinceId, boundedLimit]);

      if (!res.rows.length) return [];
      const ids = res.rows.map((r: any) => r.id);
      const cellRes = await this.pool.query(`
        SELECT telemetry_id, cell_index, voltage FROM cell_data WHERE telemetry_id = ANY($1) ORDER BY telemetry_id, cell_index ASC
      `, [ids]);

      const cellMap = new Map<number, number[]>();
      for (const c of cellRes.rows) {
        if (!cellMap.has(c.telemetry_id)) cellMap.set(c.telemetry_id, []);
        cellMap.get(c.telemetry_id)!.push(Number(c.voltage));
      }

      return res.rows.map((r: any) => {
        const cells = cellMap.get(r.id) || [];
        const totalV = Number(r.total_voltage);
        const curr = Number(r.current);
        const cell_min = cells.length ? Math.min(...cells) : null;
        const cell_max = cells.length ? Math.max(...cells) : null;
        return {
          id: r.id,
          timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
          total_voltage: totalV,
          current: curr,
          power: totalV * curr,
          soc: r.soc,
          capacity_remaining: Number(r.capacity_remaining),
          temp_mos: Number(r.temp_mos),
          temp_battery_1: Number(r.temp_battery_1),
          temp_battery_2: Number(r.temp_battery_2),
          charging_enabled: r.charging_enabled,
          discharging_enabled: r.discharging_enabled,
          cell_voltages: cells,
          cell_min_voltage: cell_min,
          cell_max_voltage: cell_max,
          cell_diff: cell_min != null && cell_max != null ? cell_max - cell_min : null,
        };
      });
    }

    // SQLite
    const rows = this.sqliteDb!.prepare(`
      SELECT * FROM bms_telemetry WHERE id > ? ORDER BY id ASC LIMIT ?
    `).all(sinceId, boundedLimit) as any[];

    if (!rows.length) return [];

    const telemetryIds = rows.map((r) => r.id);
    const placeholders = telemetryIds.map(() => '?').join(',');
    const cellRows = this.sqliteDb!.prepare(`
      SELECT telemetry_id, cell_index, voltage FROM cell_data WHERE telemetry_id IN (${placeholders}) ORDER BY telemetry_id, cell_index ASC
    `).all(...telemetryIds) as Array<{ telemetry_id: number; cell_index: number; voltage: number }>;

    const cellMap = new Map<number, number[]>();
    for (const c of cellRows) {
      if (!cellMap.has(c.telemetry_id)) cellMap.set(c.telemetry_id, []);
      cellMap.get(c.telemetry_id)!.push(c.voltage);
    }

    return rows.map((r) => {
      const cells = cellMap.get(r.id) || [];
      const totalV = Number(r.total_voltage);
      const curr = Number(r.current);
      const cell_min = cells.length ? Math.min(...cells) : null;
      const cell_max = cells.length ? Math.max(...cells) : null;
      return {
        id: r.id,
        timestamp: String(r.timestamp),
        total_voltage: totalV,
        current: curr,
        power: totalV * curr,
        soc: r.soc,
        capacity_remaining: Number(r.capacity_remaining),
        temp_mos: Number(r.temp_mos),
        temp_battery_1: Number(r.temp_battery_1),
        temp_battery_2: Number(r.temp_battery_2),
        charging_enabled: r.charging_enabled,
        discharging_enabled: r.discharging_enabled,
        cell_voltages: cells,
        cell_min_voltage: cell_min,
        cell_max_voltage: cell_max,
        cell_diff: cell_min != null && cell_max != null ? cell_max - cell_min : null,
      };
    });
  }

  public async getCellHistory(cellIndex: number, limit = 200): Promise<any[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 1000);

    if (this.isPostgres && this.pool) {
      const res = await this.pool.query(`
        SELECT c.voltage, c.cell_index, t.timestamp, t.id as telemetry_id
        FROM cell_data c
        JOIN bms_telemetry t ON t.id = c.telemetry_id
        WHERE c.cell_index = $1
        ORDER BY t.timestamp DESC
        LIMIT $2
      `, [cellIndex, boundedLimit]);
      return res.rows.reverse().map((r: any) => ({
        ...r,
        voltage: Number(r.voltage),
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
      }));
    }

    // SQLite fallback
    const rows = this.sqliteDb!.prepare(`
      SELECT c.voltage, c.cell_index, t.timestamp, t.id as telemetry_id
      FROM cell_data c
      JOIN bms_telemetry t ON t.id = c.telemetry_id
      WHERE c.cell_index = ?
      ORDER BY t.timestamp DESC
      LIMIT ?
    `).all(cellIndex, boundedLimit) as any[];

    return rows.reverse();
  }

  public async getLatestCells(limit = 50): Promise<any[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 200);

    if (this.isPostgres && this.pool) {
      const res = await this.pool.query(`
        SELECT c.cell_index, c.voltage, t.timestamp, t.id as telemetry_id
        FROM cell_data c
        JOIN bms_telemetry t ON t.id = c.telemetry_id
        WHERE t.id IN (
          SELECT id FROM bms_telemetry ORDER BY timestamp DESC LIMIT $1
        )
        ORDER BY t.timestamp ASC, c.cell_index ASC
      `, [boundedLimit]);
      return res.rows.map((r: any) => ({
        ...r,
        voltage: Number(r.voltage),
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
      }));
    }

    // SQLite fallback
    return this.sqliteDb!.prepare(`
      SELECT c.cell_index, c.voltage, t.timestamp, t.id as telemetry_id
      FROM cell_data c
      JOIN bms_telemetry t ON t.id = c.telemetry_id
      WHERE t.id IN (
        SELECT id FROM bms_telemetry ORDER BY timestamp DESC LIMIT ?
      )
      ORDER BY t.timestamp ASC, c.cell_index ASC
    `).all(boundedLimit) as any[];
  }

  public async getSettings(): Promise<any> {
    if (this.isPostgres && this.pool) {
      const res = await this.pool.query(`SELECT * FROM bms_settings WHERE id = 1`);
      if (res.rows.length) {
        const row = res.rows[0];
        return {
          batteryCapacityAh: Number(row.battery_capacity_ah),
          enableManualSoc: row.enable_manual_soc === 1,
          socMethod: row.soc_method,
          vMin: Number(row.v_min),
          vMax: Number(row.v_max),
          sohOverride: row.soh_override != null ? Number(row.soh_override) : 100,
          updatedAt: row.updated_at,
        };
      }
    } else if (this.sqliteDb) {
      const row = this.sqliteDb.prepare(`SELECT * FROM bms_settings WHERE id = 1`).get() as any;
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
    }

    return {
      batteryCapacityAh: 130,
      enableManualSoc: false,
      socMethod: 'lifepo4_curve',
      vMin: 24.0,
      vMax: 27.2,
      sohOverride: 100,
    };
  }

  public async updateSettings(body: any): Promise<any> {
    const batteryCapacityAh = Number(body.batteryCapacityAh) || 130;
    const enableManualSoc = body.enableManualSoc ? 1 : 0;
    const socMethod = String(body.socMethod || 'lifepo4_curve');
    const vMin = Number(body.vMin) || 24.0;
    const vMax = Number(body.vMax) || 27.2;
    const sohOverride = Number(body.sohOverride) > 0 ? Number(body.sohOverride) : 100;

    if (this.isPostgres && this.pool) {
      await this.pool.query(`
        INSERT INTO bms_settings (id, battery_capacity_ah, enable_manual_soc, soc_method, v_min, v_max, soh_override, updated_at)
        VALUES (1, $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          battery_capacity_ah = EXCLUDED.battery_capacity_ah,
          enable_manual_soc = EXCLUDED.enable_manual_soc,
          soc_method = EXCLUDED.soc_method,
          v_min = EXCLUDED.v_min,
          v_max = EXCLUDED.v_max,
          soh_override = EXCLUDED.soh_override,
          updated_at = CURRENT_TIMESTAMP
      `, [batteryCapacityAh, enableManualSoc, socMethod, vMin, vMax, sohOverride]);
    } else if (this.sqliteDb) {
      this.sqliteDb.prepare(`
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
    }

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
