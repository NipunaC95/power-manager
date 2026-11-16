# Deploying JK-BMS to Render (with Managed PostgreSQL)

This guide walks you through deploying the complete JK-BMS platform to **[Render](https://dashboard.render.com)** using Render's managed **PostgreSQL** database and unified Web Service (React frontend + Node.js backend + MQTT subscriber + WebSockets).

---

## Architecture on Render

```mermaid
flowchart LR
    ESP["ESP32 Gateway\n(BLE + Wi-Fi)"] -->|"MQTT Publish"| Broker["EMQX MQTT Broker\n(broker.emqx.io)"]

    subgraph Render["Render Cloud (dashboard.render.com)"]
        subgraph WebService["Web Service (jkbms-server)"]
            MQTT_Sub["MQTT Ingest Daemon"]
            WS["WebSocket Server (/api/ws)"]
            REST["REST API (/api/latest, ...)"]
            Web["React Dark UI Hosting"]
        end
        PG[("Render Managed PostgreSQL\n(bms_telemetry & cell_data)")]
    end

    Broker -->|"MQTT Subscribe"| MQTT_Sub
    MQTT_Sub -->|"SQL INSERT"| PG
    MQTT_Sub -->|"Realtime Push (<5ms)"| WS
    WS <-->|"Live Data Stream"| Browser["User Browser"]
    Browser -->|"HTTP / Web"| Web
    REST <--> PG
```

---

## Method 1: 1-Click Blueprint Deploy (Recommended)

Render includes native support for Infrastructure-as-Code via [`render.yaml`](file:///Users/nipunachandimal/Desktop/jkbms/render.yaml).

1. Commit and push your code to GitHub or GitLab:
   ```bash
   git add .
   git commit -m "Support Render deployment with PostgreSQL"
   git push origin main
   ```
2. Log into **[dashboard.render.com](https://dashboard.render.com)**.
3. Click the **New +** button in the top navigation bar and select **Blueprint**.
4. Connect and select your **jkbms** repository.
5. Render will automatically parse `render.yaml` and configure:
   * **Database:** `jkbms-postgres` (PostgreSQL)
   * **Web Service:** `jkbms-server` (Node.js with auto-bound `DATABASE_URL`)
6. Click **Apply**.
7. Render will provision the PostgreSQL instance, run the build, and launch your application at:
   `https://jkbms-server.onrender.com`

---

## Method 2: Manual Setup via Render Dashboard

If you prefer to configure the services manually in the Render UI:

### Step 1: Create the Managed PostgreSQL Database
1. In the Render Dashboard, click **New +** → **PostgreSQL**.
2. Set the following:
   * **Name:** `jkbms-postgres`
   * **Database:** `jkbms`
   * **User:** `jkbms_user`
   * **Region:** Choose the region closest to you (e.g. *Singapore*, *Oregon*, or *Frankfurt*).
   * **Plan:** Free or Starter.
3. Click **Create Database**.
4. Once created, copy the **Internal Database URL** (e.g. `postgres://jkbms_user:pass@dpg-xxx:5432/jkbms`).

### Step 2: Create the Web Service
1. Click **New +** → **Web Service**.
2. Connect your GitHub/GitLab repository.
3. Configure settings:
   * **Name:** `jkbms-server`
   * **Region:** Same region as your database.
   * **Branch:** `main`
   * **Runtime:** `Node`
   * **Build Command:**
     ```bash
     npm install && cd frontend && npm install && cd .. && npm run build:standalone
     ```
   * **Start Command:**
     ```bash
     node dist/server.js
     ```
   * **Plan:** Free or Starter.

4. Scroll down to **Environment Variables** and add:
   | Key | Value | Note |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Production mode |
   | `DATABASE_URL` | *(Paste Internal Database URL from Step 1)* | Connects to PostgreSQL |
   | `MQTT_SERVER` | `broker.emqx.io` | MQTT Broker host |
   | `MQTT_PORT` | `1883` | MQTT Broker port |
   | `MQTT_TOPIC` | `jkbms/+/telemetry` | Topic matching your ESP32 |

5. Click **Create Web Service**.

---

## Features on Render:

* **Automatic Schema Migration:** The server automatically checks if tables exist on boot and runs `schema_pg.sql` against your Render PostgreSQL database.
* **Live WebSockets:** Render supports WebSockets out of the box on port 443/HTTPS (`wss://jkbms-server.onrender.com/api/ws`).
* **Zero Laptop Dependency:** The server runs 24/7 in the cloud, listening to MQTT from your ESP32, storing readings into PostgreSQL, and serving the React dashboard.

