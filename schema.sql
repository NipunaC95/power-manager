CREATE TABLE IF NOT EXISTS bms_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_voltage REAL,
    current REAL,
    power REAL,
    soc INTEGER,
    capacity_remaining REAL,
    cell_min_voltage REAL,
    cell_max_voltage REAL,
    cell_diff REAL,
    temp_mos REAL,
    temp_battery_1 REAL,
    temp_battery_2 REAL,
    charging_enabled INTEGER,
    discharging_enabled INTEGER,
    cell_voltages TEXT
);

-- New table for individual cell data (separate from telemetry)
CREATE TABLE IF NOT EXISTS cell_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telemetry_id INTEGER NOT NULL,
    cell_index INTEGER NOT NULL,
    voltage REAL NOT NULL,
    FOREIGN KEY (telemetry_id) REFERENCES bms_telemetry(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bms_timestamp ON bms_telemetry(timestamp DESC);
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_voltage REAL,
    current REAL,
    power REAL,
    soc INTEGER,
    capacity_remaining REAL,
    cell_min_voltage REAL,
    cell_max_voltage REAL,
    cell_diff REAL,
    temp_mos REAL,
    temp_battery_1 REAL,
    temp_battery_2 REAL,
    charging_enabled INTEGER,
    discharging_enabled INTEGER,
    cell_voltages TEXT
);

CREATE INDEX IF NOT EXISTS idx_bms_timestamp ON bms_telemetry(timestamp DESC);

