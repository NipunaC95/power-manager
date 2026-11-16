# Porting & Connecting JK-BMS to Supabase

This guide explains how to connect your JK-BMS monitoring platform to **[Supabase](https://supabase.com)** (Free Tier).

Supabase provides a production-grade **PostgreSQL database**, **Supabase Realtime (WebSockets)**, and an intuitive web dashboard for viewing and managing battery telemetry.

---

## Architecture with Supabase

```mermaid
flowchart LR
    ESP["ESP32 Gateway\n(BLE + Wi-Fi)"] -->|"MQTT Publish"| Broker["EMQX MQTT Broker\n(broker.emqx.io)"]

    subgraph Host["App Server / Cloud VM / Local"]
        Bridge["JK-BMS Standalone Server\n(MQTT Ingest + Web Hosting)"]
    end

    subgraph Supabase["Supabase Cloud (supabase.com)"]
        PG[("PostgreSQL Database\n(bms_telemetry & cell_data)")]
        Realtime["Supabase Realtime\n(Change Data Capture)"]
        Studio["Supabase Studio Web Dashboard\n(Table & SQL Editor)"]
    end

    Broker -->|"MQTT Subscribe"| Bridge
    Bridge -->|"pg (Pooled SSL)"| PG
    PG --> Realtime
    PG --> Studio
    Bridge <-->|"Live WebSockets & SPA"| Browser["User React Dashboard"]
```

---

## Step 1: Create a Free Project on Supabase

1. Go to **[supabase.com](https://supabase.com)** and log in (or sign up with GitHub).
2. Click **New project**.
3. Fill in the project details:
   * **Name:** `jkbms`
   * **Database Password:** Choose a strong password and save it.
   * **Region:** Select a region close to your physical location (e.g., *Singapore*, *Frankfurt*, or *US East*).
   * **Pricing Plan:** **Free tier** ($0/month).
4. Click **Create new project** and wait ~1-2 minutes for the database to provision.

---

## Step 2: Apply the Database Schema & Enable Realtime

1. In your Supabase Project dashboard, click **SQL Editor** in the left sidebar (the `>_` icon).
2. Click **+ New query**.
3. Copy the entire contents of [`schema_supabase.sql`](file:///Users/nipunachandimal/Desktop/jkbms/schema_supabase.sql) from your repository and paste it into the SQL editor.
4. Click **Run** (or `Ctrl+Enter`).

**What this creates automatically:**
* Table `bms_telemetry` with auto-calculated `power` generated column and timestamp index.
* Table `cell_data` with foreign key cascade delete.
* Table `bms_settings` with default battery parameters.
* Row Level Security (RLS) policies allowing public dashboard reads and authenticated writes.
* Activates **Supabase Realtime** on `bms_telemetry` and `cell_data`.

---

## Step 3: Get Your Supabase Database Connection String

1. In Supabase, click the **Settings (gear icon)** at the bottom of the left sidebar.
2. Navigate to **Database**.
3. Scroll down to the **Connection parameters** / **Connection string** section.
4. Select the **URI** tab.
5. Under **Mode**, choose **Session** (or **Transaction** for connection pooling).
   * It looks like this:
     ```text
     postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
     ```
   * Replace `[YOUR-PASSWORD]` with the database password you chose in Step 1.

---

## Step 4: Run the Application with Supabase

### Locally or on any Cloud Host:

1. Open your [`.env`](file:///Users/nipunachandimal/Desktop/jkbms/.env) file and set `DATABASE_URL`:
   ```bash
   DATABASE_URL="postgresql://postgres:Nipuna@vhandimal@db.ljjajsrihkkzdsjrfubd.supabase.co:5432/postgres"
   ```
   

2. Build and launch:
   ```bash
   npm run build:standalone
   npm run start:server
   ```

3. You will see in the startup logs:
   ```text
   [DB] Connecting to PostgreSQL (Render Managed Database / Supabase)...
   [DB] PostgreSQL schema initialized successfully.
   [MQTT] Connected successfully to mqtt://broker.emqx.io:1883
   [MQTT] Successfully subscribed to jkbms/+/telemetry
   [SERVER] JKBMS Standalone Server running at http://0.0.0.0:3000
   ```

---

## Step 5: View Live Data in Supabase Studio

Once your ESP32 streams telemetry to MQTT:
1. Open your Supabase dashboard and click **Table Editor** on the left menu.
2. Click **bms_telemetry**: you will see live battery pack rows (pack voltage, current, power, SOC, temperature) updating.
3. Click **cell_data**: you will see the individual cell voltages for each telemetry record.

