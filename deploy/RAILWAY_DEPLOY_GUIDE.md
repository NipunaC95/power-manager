# Railway Docker Deployment Guide (JK-BMS Cloud Platform)

This repository includes a production-grade multi-stage `Dockerfile` and `railway.json` to deploy the complete JK-BMS application (React Frontend + Express API + Realtime WebSocket Server + MQTT Listener) on [Railway](https://railway.app).

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │             Railway Cloud              │
                      │                                        │
  ESP32 (MQTT) ─────► │  Node.js Standalone Container         │
  broker.emqx.io      │  - MQTT Subscriber (broker.emqx.io)   │
                      │  - WebSocket Server (/api/ws)          │
  Browser (HTTPS) ──► │  - Static React SPA Host (/)           │ ◄───► PostgreSQL
  (Zed-style UI)      │  - REST Telemetry API (/api/*)         │     (Railway / Supabase)
                      │                                        │       OR
                      │  Volume: /app/data (SQLite Fallback)   │     SQLite (WAL)
                      └────────────────────────────────────────┘
```

---

## Deployment Option A: One-Click via GitHub (Recommended)

1. **Push to GitHub**:
   Ensure your latest code is pushed to your GitHub repository:
   ```bash
   git add .
   git commit -m "feat: configure Docker and Railway deployment"
   git push origin main
   ```

2. **Create Project in Railway**:
   - Go to [Railway Dashboard](https://railway.app/dashboard).
   - Click **New Project** → **Deploy from GitHub repo**.
   - Select your repository (`power-manager` / `jkbms`).

3. **Railway Auto-Detection**:
   - Railway will automatically detect `railway.json` and `Dockerfile`.
   - It will build the multi-stage Docker container and prepare the service.

4. **Add a Public Domain**:
   - Click on your newly created service in Railway.
   - Go to the **Settings** tab → Scroll down to **Networking**.
   - Click **Generate Domain** (e.g., `https://jkbms-production.up.railway.app`).

5. **(Optional) Add Database**:
   - **PostgreSQL**: Click **New** → **Database** → **Add PostgreSQL**. Railway will automatically link `DATABASE_URL` to your app service.
   - **SQLite**: Go to your app service → **Volumes** → **Add Volume** mounted to `/app/data` (to persist data across container restarts).

---

## Deployment Option B: Railway CLI

If you prefer deploying directly from your terminal:

1. **Install Railway CLI** (if not already installed):
   ```bash
   npm i -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Initialize & Link Project**:
   ```bash
   railway init
   ```

4. **Deploy**:
   ```bash
   railway up
   ```

5. **Generate Domain**:
   ```bash
   railway domain
   ```

---

## Environment Variables Reference

Configure these in Railway under **Variables** (only set what you need; all have intelligent defaults):

| Variable | Default Value | Description |
|---|---|---|
| `PORT` | Dynamic (`3000`) | Injected automatically by Railway |
| `NODE_ENV` | `production` | Production mode |
| `TARGET_SERIAL` | `507268D28101263` | Target JK-BMS Device Serial |
| `MQTT_SERVER` | `broker.emqx.io` | MQTT Broker hostname |
| `MQTT_PORT` | `1883` | MQTT Broker port |
| `MQTT_TOPIC` | `jkbms/+/telemetry` | Subscribed topic pattern |
| `DATABASE_URL` | *(None / SQLite fallback)* | Connection string for Railway Postgres or Supabase |
| `DB_PATH` | `/app/data/jkbms.db` | Local SQLite path when `DATABASE_URL` is unset |
| `PUBLIC_DIR` | `/app/public` | Static files location |
| `API_KEY` | *(None / Disabled)* | Optional auth key for `/api/telemetry` POST |

---

## Verification & Testing

Once deployed on Railway:

1. **Health Check**:
   ```bash
   curl -i https://<your-railway-app>.up.railway.app/health
   # Returns: {"status":"ok","service":"jkbms-standalone",...}
   ```

2. **Live Telemetry API**:
   ```bash
   curl -i https://<your-railway-app>.up.railway.app/api/latest
   ```

3. **Open Dashboard**:
   Open `https://<your-railway-app>.up.railway.app` in any browser:
   - Green **ONLINE** / **WS LIVE** status indicates active streaming.
   - Individual cell voltages, real-time power chart, temperatures, and dynamic runtime estimates update every 2 seconds.

