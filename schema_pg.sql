-- JK-BMS PostgreSQL Schema for Render Managed Database

CREATE TABLE IF NOT EXISTS bms_telemetry (
    id                  SERIAL PRIMARY KEY,
    timestamp           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_voltage       DOUBLE PRECISION NOT NULL,
    current             DOUBLE PRECISION NOT NULL,
    soc                 INTEGER NOT NULL,
    capacity_remaining  DOUBLE PRECISION,
    temp_mos            DOUBLE PRECISION,
    temp_battery_1      DOUBLE PRECISION,
    temp_battery_2      DOUBLE PRECISION,
    charging_enabled    INTEGER DEFAULT 1,
    discharging_enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cell_data (
    telemetry_id INTEGER NOT NULL REFERENCES bms_telemetry(id) ON DELETE CASCADE,
    cell_index   INTEGER NOT NULL,
    voltage      DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (telemetry_id, cell_index)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON bms_telemetry(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cell_telemetry ON cell_data(telemetry_id);
CREATE INDEX IF NOT EXISTS idx_cell_index_ts ON cell_data(cell_index, telemetry_id);

CREATE TABLE IF NOT EXISTS bms_settings (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    battery_capacity_ah DOUBLE PRECISION NOT NULL DEFAULT 100,
    enable_manual_soc   INTEGER NOT NULL DEFAULT 0,
    soc_method          TEXT NOT NULL DEFAULT 'lifepo4_curve',
    v_min               DOUBLE PRECISION NOT NULL DEFAULT 24.0,
    v_max               DOUBLE PRECISION NOT NULL DEFAULT 27.2,
    soh_override        DOUBLE PRECISION DEFAULT 100,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO bms_settings (id, battery_capacity_ah, enable_manual_soc, soc_method, v_min, v_max, soh_override)
VALUES (1, 100, 0, 'lifepo4_curve', 24.0, 27.2, 100)
ON CONFLICT (id) DO NOTHING;

