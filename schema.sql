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

CREATE INDEX IF NOT EXISTS idx_bms_timestamp ON bms_telemetry(timestamp DESC);

