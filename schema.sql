-- JK-BMS Cloudflare D1 Schema
-- Optimized: derived values computed at query time, cell-level history in its own table.

-- Pack-level telemetry (one row per reading from the ESP32)
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

-- Cell-level voltage history (one row per cell per reading)
-- Composite PK avoids a useless auto-increment id and enforces uniqueness.
CREATE TABLE IF NOT EXISTS cell_data (
    telemetry_id INTEGER NOT NULL,
    cell_index   INTEGER NOT NULL,
    voltage      REAL    NOT NULL,
    PRIMARY KEY (telemetry_id, cell_index),
    FOREIGN KEY (telemetry_id) REFERENCES bms_telemetry(id) ON DELETE CASCADE
);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_ts   ON bms_telemetry(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cell_telemetry ON cell_data(telemetry_id);
CREATE INDEX IF NOT EXISTS idx_cell_index_ts  ON cell_data(cell_index, telemetry_id);
