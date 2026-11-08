# JK-BMS to Cloudflare (Free Tier) Setup Guide

This project allows an **ESP32** to wirelessly read real-time telemetry from your **JK-BMS** via **Bluetooth Low Energy (BLE)** and transmit it over **Wi-Fi** into a **Cloudflare D1 SQLite database** via a **Cloudflare Worker**, with an included web dashboard.

---

## Architecture

1. **ESP32**: Connects to the JK-BMS over BLE (Service `0xFFE0`), decodes the JK binary frame, and sends JSON payloads every 15s over HTTPS.
2. **Cloudflare Worker & D1**: Serverless API endpoint (`/api/telemetry`) that writes records to a free serverless D1 SQLite database.
3. **Cloudflare Pages / Dashboard**: Serves a sleek dark-mode dashboard showing pack voltage, current, power, SoC, temperatures, individual cell voltages, and historical line charts.

---

## 1. Cloudflare Setup (Free Tier)

### Prerequisites
- Node.js installed.
- Install Wrangler CLI:
  ```bash
  npm install -g wrangler
  ```
- Log in to your Cloudflare account:
  ```bash
  wrangler login
  ```

### Step 1: Create the D1 Database
In the root directory of this project (`/Users/nipunachandimal/Desktop/jkbms`):
```bash
wrangler d1 create jkbms-db
```
The command will print output like:
```toml
[[d1_databases]]
binding = "DB"
database_name = "jkbms-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```
Copy that `database_id` into [`wrangler.toml`](file:///Users/nipunachandimal/Desktop/jkbms/wrangler.toml) replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

### Step 2: Apply the Database Schema
Execute the SQL schema to create the `bms_telemetry` table:
```bash
wrangler d1 execute jkbms-db --file=./schema.sql --remote
```

### Step 3: Deploy the Cloudflare Worker & Dashboard
```bash
wrangler deploy
```
Cloudflare will give you a public URL (e.g. `https://jkbms-cloud.<your-subdomain>.workers.dev`).

---

## 2. ESP32 Setup (Arduino IDE / PlatformIO)

### Required Libraries
In Arduino IDE (Tools -> Manage Libraries):
1. **NimBLE-Arduino** (by h2zero) - lightweight BLE stack.
2. **ArduinoJson** (by Benoit Blanchon, v6 or v7).

### Configure the Firmware
Open [`esp32/jk_bms_gateway.ino`](file:///Users/nipunachandimal/Desktop/jkbms/esp32/jk_bms_gateway.ino) and update:
- `WIFI_SSID` & `WIFI_PASSWORD`
- `CLOUDFLARE_URL`: Set to your deployed worker URL + `/api/telemetry`
- `API_KEY`: Must match the `API_KEY` defined in `wrangler.toml`
- `BMS_MAC_ADDRESS` *(optional)*: If left blank, it auto-connects to the first device whose Bluetooth name begins with `JK-`.

### Flash the ESP32
Select your board (e.g., `ESP32 Dev Module`) and click **Upload**.

---

## 3. Viewing the Dashboard

Visit your deployed Cloudflare URL:
`https://jkbms-cloud.<your-subdomain>.workers.dev`

It will load the live telemetry cards, cell voltage bars, and historical battery charts automatically.

