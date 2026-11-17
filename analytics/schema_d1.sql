-- Cloudflare D1 Database Schema for Advanced JK-BMS Battery Analytics

CREATE TABLE IF NOT EXISTS bms_telemetry (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id           INTEGER UNIQUE NOT NULL,
    timestamp           DATETIME NOT NULL,
    total_voltage       REAL NOT NULL,
    current             REAL NOT NULL,
    power               REAL NOT NULL,
    soc                 INTEGER NOT NULL,
    capacity_remaining  REAL NOT NULL,
    cell_min_voltage    REAL,
    cell_max_voltage    REAL,
    cell_diff           REAL,
    temp_mos            REAL,
    temp_battery_1      REAL,
    temp_battery_2      REAL,
    charging_enabled    INTEGER DEFAULT 1,
    discharging_enabled INTEGER DEFAULT 1,
    cell_voltages       TEXT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bms_telemetry_ts ON bms_telemetry(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_bms_telemetry_srv_id ON bms_telemetry(server_id ASC);

CREATE TABLE IF NOT EXISTS hourly_analytics (
    hour_bucket             TEXT PRIMARY KEY, -- Format: YYYY-MM-DD HH:00:00
    date                    TEXT NOT NULL,    -- Format: YYYY-MM-DD
    record_count            INTEGER NOT NULL,
    kwh_charged             REAL NOT NULL DEFAULT 0,
    kwh_discharged          REAL NOT NULL DEFAULT 0,
    net_kwh                 REAL NOT NULL DEFAULT 0,
    avg_voltage             REAL NOT NULL,
    min_voltage             REAL NOT NULL,
    max_voltage             REAL NOT NULL,
    avg_current             REAL NOT NULL,
    peak_charge_current     REAL NOT NULL DEFAULT 0,
    peak_discharge_current  REAL NOT NULL DEFAULT 0,
    avg_soc                 REAL NOT NULL,
    min_soc                 INTEGER NOT NULL,
    max_soc                 INTEGER NOT NULL,
    max_cell_diff           REAL NOT NULL,
    avg_cell_diff           REAL NOT NULL,
    weakest_cell_index      INTEGER,
    max_temp_mos            REAL,
    max_temp_battery        REAL,
    computed_at             DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hourly_date ON hourly_analytics(date DESC);

CREATE TABLE IF NOT EXISTS daily_analytics (
    date                    TEXT PRIMARY KEY, -- Format: YYYY-MM-DD
    total_records           INTEGER NOT NULL,
    kwh_charged             REAL NOT NULL DEFAULT 0,
    kwh_discharged          REAL NOT NULL DEFAULT 0,
    net_kwh                 REAL NOT NULL DEFAULT 0,
    coulomb_efficiency      REAL NOT NULL DEFAULT 100.0,
    equivalent_full_cycles  REAL NOT NULL DEFAULT 0,
    min_soc                 INTEGER NOT NULL,
    max_soc                 INTEGER NOT NULL,
    soc_swing               INTEGER NOT NULL,
    peak_charge_watts       REAL NOT NULL DEFAULT 0,
    peak_discharge_watts    REAL NOT NULL DEFAULT 0,
    max_cell_delta          REAL NOT NULL DEFAULT 0,
    weakest_cell_index      INTEGER,
    highest_temp_mos        REAL,
    highest_temp_bat        REAL,
    estimated_soh           REAL DEFAULT 100.0,
    health_score            INTEGER DEFAULT 100,
    computed_at             DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_metadata (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial sync cursor if not present
INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('last_synced_id', '0');
INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('last_sync_time', 'never');
INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('sync_status', 'idle');
INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('battery_capacity_ah', '100');
INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('nominal_voltage', '25.6');

