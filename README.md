# JK-BMS Cloud & Edge Telemetry Platform

A complete, production-ready IoT monitoring platform for **JK-BMS** (Jikong Battery Management Systems) with active balancing. Wirelessly captures real-time pack and individual cell telemetry over **Bluetooth Low Energy (BLE)** via an **ESP32**, transmits metrics via **MQTT**, stores records in a serverless **Cloudflare D1 SQLite database**, and displays live diagnostics on a high-performance **React + TypeScript dark-mode dashboard**.

---

## Architecture Overview

```mermaid
flowchart LR
    subgraph Battery["Battery Pack"]
        JK["JK-BMS\n(Active Balancer)"]
    end

    subgraph Edge["Edge Gateway"]
        ESP["ESP32 Gateway\n(NimBLE + PubSubClient)"]
    end

    subgraph Transport["Transport Layer"]
        MQTT[("MQTT Broker\n(e.g., broker.emqx.io:1883)")]
        Bridge["Ingestion Bridge\n(scripts/mqtt_bridge.ts)"]
    end

    subgraph Cloud["Cloudflare Infrastructure"]
        Ingest["Ingestion Worker\n(jkbms-cloud)"]
        D1[("Cloudflare D1\n(jkbms-db SQLite)")]
        Dash["Dashboard Worker\n(jkbms-dashboard)"]
        SPA["React 18 + TypeScript UI\n(Zed Dark Theme)"]
    end

    JK -->|Autonomous BLE Stream\nFFE0 / FFE1 (Silent)| ESP
    ESP -->|MQTT Publish\njkbms/<serial>/telemetry| MQTT
    MQTT -->|MQTT Subscribe| Bridge
    Bridge -->|Batch POST + API Key| Ingest
    Ingest -->|Transactional Insert| D1
    D1 -->|Queries & Aggregations| Dash
    Dash -->|REST & WebSockets| SPA
```

### Key Architectural Highlights

1. **Silent, Autonomous BLE Streaming (No Warning Beeps):**
   - The ESP32 subscribes to notification characteristic `0xFFE1` under service `0xFFE0` and performs the initial handshake (`0x97` Device Info + `0x96` Cell Info) causing the standard two startup beeps.
   - Once initialized, the JK-BMS streams notification chunks continuously without polling. Periodic polling commands in `loop()` have been eliminated, keeping the BMS hardware buzzer completely silent just like the official mobile app.
2. **Lightweight, Non-Blocking MQTT Transport:**
   - ESP32 publishes telemetry JSON payloads over MQTT (`PubSubClient`) instead of heavy, blocking synchronous HTTPS POST requests.
3. **Dedicated Two-Worker Cloudflare Setup:**
   - **`workers/ingest` (`jkbms-cloud`):** Dedicated high-throughput ingestion endpoint (`POST /api/telemetry`) with transactional batch insertion into `bms_telemetry` and per-cell `cell_data`.
   - **`workers/dashboard` (`jkbms-dashboard`):** Serves the pre-compiled React dashboard and telemetry queries (`GET /api/latest`, `GET /api/history`, WebSocket real-time updates).
4. **Single Source of Truth (`.env`):**
   - All Wi-Fi passwords, BMS serials, MQTT broker parameters, Cloudflare URLs, API keys, and database IDs reside in a root [`.env`](file:///Users/nipunachandimal/Desktop/jkbms/.env) file.
   - Automatically synchronizes to C/C++ firmware headers (`config.h`), PlatformIO build flags, and worker configs via [`scripts/sync_env.js`](file:///Users/nipunachandimal/Desktop/jkbms/scripts/sync_env.js).
   - `.env` and `config.h` are `.gitignore`d to prevent secret leaks; [`.env.example`](file:///Users/nipunachandimal/Desktop/jkbms/.env.example) serves as the tracked template.
5. **Strict TypeScript & React Frontend:**
   - Interactive charts with point-anchored floating tooltips, dynamic cell voltage bar visualizers, and delta diagnostics.

---

## Repository Structure

```
├── .env                       # Single source of truth for secrets & config (git-ignored)
├── .env.example               # Template environment configuration file
├── env_load.py                # PlatformIO SCons pre-build hook that loads .env
├── platformio.ini             # PlatformIO build configuration
├── schema.sql                 # D1 database schema (bms_telemetry & cell_data)
├── package.json               # NPM scripts, build pipelines & dependencies
│
├── esp32/
│   ├── jk_bms_gateway.ino     # Arduino IDE sketch (includes auto-generated config.h)
│   └── config.h               # Auto-generated from .env (git-ignored)
│
├── src_pio/
│   ├── main.cpp               # PlatformIO C++ source code
│   └── config.h               # Auto-generated from .env (git-ignored)
│
├── scripts/
│   ├── sync_env.js            # Syncs .env to C++ headers & worker environment files
│   ├── mqtt_bridge.ts         # Daemon subscribing to MQTT and writing to Cloudflare D1
│   └── dev.js                 # Local dev server with live bundling and upstream proxy
│
├── workers/
│   ├── ingest/                # Dedicated Ingestion Worker (Cloudflare D1 writes)
│   │   ├── src/index.ts
│   │   └── wrangler.toml
│   └── dashboard/             # Web App & Dashboard Worker (API + Static Assets)
│       ├── src/index.ts
│       └── wrangler.toml
│
└── frontend/                  # React 18 + TypeScript Application
    ├── src/
    │   ├── App.tsx
    │   ├── main.tsx
    │   ├── types.ts
    │   ├── components/        # Chart, CellGrid, CellTile, Header, Metric, Settings
    │   └── hooks/             # useTelemetry hook with fallback polling
    └── build.js               # esbuild bundler script (outputs to public/bundle.js)
```

---

## Setup & Getting Started

### 1. Prerequisites
- **Node.js** (v18+ recommended)
- **PlatformIO** (CLI `pio` or VS Code extension) OR **Arduino IDE** (v2.x)
- **Cloudflare Account** (Free tier is fully supported)
- **Wrangler CLI**:
  ```bash
  npm install -g wrangler
  wrangler login
  ```

---

### 2. Configure Environment (`.env`)

Copy [`.env.example`](file:///Users/nipunachandimal/Desktop/jkbms/.env.example) to `.env` in the root directory:
```bash
cp .env.example .env
```

Edit [`.env`](file:///Users/nipunachandimal/Desktop/jkbms/.env) and populate your parameters:
```env
# Wi-Fi Configuration
WIFI_SSID="Your_WiFi_SSID"
WIFI_PASSWORD="Your_WiFi_Password"

# Target JK-BMS Device Identifier
TARGET_SERIAL="507268D28101263"
TARGET_NAME="507268D28101263"

# MQTT Broker Configuration
MQTT_SERVER="broker.emqx.io"
MQTT_PORT=1883
MQTT_USER=""
MQTT_PASSWORD=""
MQTT_TOPIC="jkbms/507268D28101263/telemetry"

# Cloudflare Ingestion & D1
CLOUDFLARE_URL="https://jkbms-cloud.<your-subdomain>.workers.dev/api/telemetry"
INGEST_URL="https://jkbms-cloud.<your-subdomain>.workers.dev/api/telemetry"
DASHBOARD_URL="https://jkbms-dashboard.<your-subdomain>.workers.dev"
API_KEY="your-secret-api-key"
DATABASE_NAME="jkbms-db"
DATABASE_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Local Dev Server Port
PORT=3000
```

Synchronize the configuration across firmware headers and worker environments:
```bash
npm run env:sync
```

---

### 3. Cloudflare D1 Database & Workers Setup

#### A. Create the D1 Database
```bash
wrangler d1 create jkbms-db
```
Copy the generated `database_id` into your `.env` under `DATABASE_ID` and into `workers/ingest/wrangler.toml` and `workers/dashboard/wrangler.toml`.

#### B. Initialize Database Schema
Run the database migrations:
```bash
npm run db:init
```

#### C. Build & Deploy Workers
Compile TypeScript workers, frontend bundle, and deploy to Cloudflare:
```bash
# Deploy both Ingestion and Dashboard workers
npm run deploy
```

---

### 4. ESP32 Firmware Upload

#### Option A: Using PlatformIO (Recommended)
Connect your ESP32 via USB and run:
```bash
# Compile and upload
pio run -t upload

# Open Serial Monitor (115200 baud)
pio device monitor
```
*(PlatformIO automatically executes `env_load.py` before building to inject settings from `.env`.)*

#### Option B: Using Arduino IDE
1. Open [`esp32/jk_bms_gateway.ino`](file:///Users/nipunachandimal/Desktop/jkbms/esp32/jk_bms_gateway.ino).
2. Install required libraries via Library Manager:
   - **NimBLE-Arduino** (by h2zero)
   - **ArduinoJson** (by Benoit Blanchon, v6.x)
   - **PubSubClient** (by Nick O'Leary)
3. Ensure you have run `npm run env:sync` so that `esp32/config.h` is populated from `.env`.
4. Select your ESP32 board and upload.

---

### 5. Running the MQTT Ingestion Bridge

The ESP32 publishes telemetry JSON to MQTT. To route incoming MQTT packets into Cloudflare D1, run the ingestion bridge daemon:

```bash
npm run start:bridge
```

The bridge connects to the MQTT broker configured in `.env`, subscribes to `jkbms/+/telemetry`, and automatically commits incoming battery records to the D1 database.

*(You can deploy this lightweight bridge on a Raspberry Pi, home server, VPS, or Docker container.)*

---

### 6. Local Frontend Development

To run the frontend dashboard locally with hot-reloading and proxying to your live Cloudflare workers:

```bash
npm run dev
```
Open your browser at `http://localhost:3000`.

---

## NPM Scripts Reference

| Command | Action |
| :--- | :--- |
| `npm run env:sync` | Synchronizes `.env` into `config.h` for ESP32 and `.dev.vars` for Workers. |
| `npm run typecheck` | Type-checks all TypeScript files (frontend & workers) without emitting. |
| `npm run build` | Compiles Workers (`esbuild`), MQTT bridge, and frontend bundle. |
| `npm run start:bridge`| Compiles and runs the MQTT-to-D1 ingestion bridge daemon. |
| `npm run dev` | Starts local dev server on port 3000 with live proxy to upstream workers. |
| `npm run deploy:ingest`| Deploys the ingestion worker (`jkbms-cloud`) to Cloudflare. |
| `npm run deploy:dashboard`| Deploys the web app & dashboard worker (`jkbms-dashboard`) to Cloudflare. |
| `npm run deploy` | Deploys both Cloudflare Workers in one command. |
| `npm run db:init` | Executes [`schema.sql`](file:///Users/nipunachandimal/Desktop/jkbms/schema.sql) on the remote Cloudflare D1 database. |

---

## Protocol & Diagnostic Reference

- **BLE Service UUID:** `0000ffe0-0000-1000-8000-00805f9b34fb`
- **Notify Characteristic:** `0000ffe1-0000-1000-8000-00805f9b34fb`
- **Frame Preamble:** `0x55 0xAA 0xEB 0x90` (300-byte frame payload)
- **Cell Voltages:** 24 cell channels decoded with dual-shift alignment (0 or 16-byte offset) for multi-generation JK BMS hardware compatibility.
- **MQTT Topic:** `jkbms/<serial>/telemetry`
