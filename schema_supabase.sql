-- ============================================================================
-- JK-BMS Supabase Schema (PostgreSQL + Realtime CDC + RLS)
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================================

-- 1. Pack-level telemetry table
CREATE TABLE IF NOT EXISTS public.bms_telemetry (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    timestamp           TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    total_voltage       DOUBLE PRECISION NOT NULL,
    current             DOUBLE PRECISION NOT NULL,
    power               DOUBLE PRECISION GENERATED ALWAYS AS (total_voltage * current) STORED,
    soc                 INTEGER NOT NULL,
    capacity_remaining  DOUBLE PRECISION,
    temp_mos            DOUBLE PRECISION,
    temp_battery_1      DOUBLE PRECISION,
    temp_battery_2      DOUBLE PRECISION,
    charging_enabled    INTEGER DEFAULT 1,
    discharging_enabled INTEGER DEFAULT 1
);

-- 2. Cell-level voltages table
CREATE TABLE IF NOT EXISTS public.cell_data (
    telemetry_id BIGINT NOT NULL REFERENCES public.bms_telemetry(id) ON DELETE CASCADE,
    cell_index   INTEGER NOT NULL,
    voltage      DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (telemetry_id, cell_index)
);

-- 3. Battery Settings table
CREATE TABLE IF NOT EXISTS public.bms_settings (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    battery_capacity_ah DOUBLE PRECISION NOT NULL DEFAULT 100,
    enable_manual_soc   INTEGER NOT NULL DEFAULT 0,
    soc_method          TEXT NOT NULL DEFAULT 'lifepo4_curve',
    v_min               DOUBLE PRECISION NOT NULL DEFAULT 24.0,
    v_max               DOUBLE PRECISION NOT NULL DEFAULT 27.2,
    soh_override        DOUBLE PRECISION DEFAULT 100,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert default settings row
INSERT INTO public.bms_settings (id, battery_capacity_ah, enable_manual_soc, soc_method, v_min, v_max, soh_override)
VALUES (1, 100, 0, 'lifepo4_curve', 24.0, 27.2, 100)
ON CONFLICT (id) DO NOTHING;

-- 4. Query Performance Indexes
CREATE INDEX IF NOT EXISTS idx_bms_telemetry_ts ON public.bms_telemetry(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cell_data_telemetry ON public.cell_data(telemetry_id);
CREATE INDEX IF NOT EXISTS idx_cell_data_index ON public.cell_data(cell_index, telemetry_id);

-- 5. Row Level Security (RLS) Configuration
ALTER TABLE public.bms_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cell_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bms_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for dashboard display)
CREATE POLICY "Allow public read access on bms_telemetry"
    ON public.bms_telemetry FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow public read access on cell_data"
    ON public.cell_data FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow public read access on bms_settings"
    ON public.bms_settings FOR SELECT
    TO anon, authenticated
    USING (true);

-- Allow service_role / backend write access
CREATE POLICY "Allow service_role write on bms_telemetry"
    ON public.bms_telemetry FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow service_role write on cell_data"
    ON public.cell_data FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow service_role write on bms_settings"
    ON public.bms_settings FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Also allow anon insert if using direct API key ingestion
CREATE POLICY "Allow anon insert on bms_telemetry"
    ON public.bms_telemetry FOR INSERT
    TO anon
    WITH CHECK (true);

CREATE POLICY "Allow anon insert on cell_data"
    ON public.cell_data FOR INSERT
    TO anon
    WITH CHECK (true);

-- 6. Enable Supabase Realtime (Change Data Capture)
-- This allows browsers to subscribe directly to new telemetry readings via WebSocket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'bms_telemetry'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bms_telemetry;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'cell_data'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cell_data;
  END IF;
END $$;

