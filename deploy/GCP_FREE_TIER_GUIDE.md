# Google Cloud Platform (GCP) Always Free Tier Deployment Guide

This guide explains how to host the complete **JK-BMS single Docker image** (React UI + Express REST API + WebSocket Server + MQTT Subscriber) on a **Google Cloud Always Free `e2-micro` VM** at **$0.00 / month forever**.

---

## GCP Always Free Limits (Compute Engine)

Google Cloud offers an [Always Free Tier](https://cloud.google.com/free/docs/free-cloud-features#compute) with no expiration:

| Resource | Free Tier Allowance | Our Configuration |
|---|---|---|
| **Instance Type** | 1 non-preemptible `e2-micro` VM | `e2-micro` (2 vCPU, 1 GB RAM) |
| **Eligible Regions** | `us-central1`, `us-west1`, `us-east1` | `us-central1-a` |
| **Disk Storage** | 30 GB standard persistent disk (`pd-standard`) | 30 GB `pd-standard` |
| **Egress Bandwidth** | 1 GB / month to all regions | < 200 MB / month for BMS telemetry |
| **Monthly Cost** | **$0.00 USD** | **$0.00 USD** |

---

## Method 1: 1-Click Automated Script (Google Cloud Shell)

The fastest and easiest way to deploy:

1. Open [Google Cloud Shell](https://shell.cloud.google.com) (free browser terminal with `gcloud` pre-authenticated).
2. Set your active project:
   ```bash
   gcloud config set project <YOUR_GCP_PROJECT_ID>
   ```
3. Run the automated deployment script:
   ```bash
   curl -sSL https://raw.githubusercontent.com/NipunaC95/power-manager/main/deploy/launch_gcp.sh | bash
   ```
   *What this script does automatically:*
   - Creates firewall rule `allow-jkbms-web` for ports 80, 443, and 3000.
   - Launches an Always Free `e2-micro` VM with a 30 GB `pd-standard` disk in `us-central1-a`.
   - Adds 2 GB swap file to prevent memory exhaustion during builds on 1 GB RAM.
   - Installs Docker Engine and Docker Compose.
   - Clones the repository and launches the single Docker container bound to port 80.
   - Prints your live dashboard URL (`http://<EXTERNAL_IP>/`).

---

## Method 2: Manual Setup via GCP Console

If you prefer using the Google Cloud web interface:

### Step 1: Create the Always Free VM
1. Go to [Compute Engine → VM Instances](https://console.cloud.google.com/compute/instances).
2. Click **Create Instance**.
3. Configure the following **exact** settings to stay 100% within the free tier:
   - **Name**: `jkbms-free-server`
   - **Region**: `us-central1 (Iowa)`
   - **Zone**: `us-central1-a`
   - **Series**: `E2`
   - **Machine type**: `e2-micro (2 vCPU, 1 GB memory)`
   - **Boot disk**: Click **Change**:
     - *Operating System*: `Ubuntu`
     - *Version*: `Ubuntu 22.04 LTS`
     - *Boot disk type*: **Standard persistent disk** *(Important: Do NOT select Balanced or SSD)*
     - *Size*: `30 GB`
   - **Firewall**: Check both:
     - `[x] Allow HTTP traffic`
     - `[x] Allow HTTPS traffic`
4. Click **Create**.

### Step 2: SSH into the VM & Run Setup
1. In the VM Instances list, click the **SSH** button next to your new instance.
2. In the SSH terminal, run:
   ```bash
   git clone https://github.com/NipunaC95/power-manager.git ~/jkbms
   cd ~/jkbms
   chmod +x deploy/gcp_vm_setup.sh
   ./deploy/gcp_vm_setup.sh
   ```
3. The script configures swap memory, installs Docker, builds the image, and starts the container.

---

## Method 3: Direct Container-Optimized OS (COS)

Google Cloud provides Container-Optimized OS to launch the Docker image directly upon VM creation:

```bash
gcloud compute instances create-with-container jkbms-server \
    --project=<YOUR_PROJECT_ID> \
    --zone=us-central1-a \
    --machine-type=e2-micro \
    --boot-disk-size=30GB \
    --boot-disk-type=pd-standard \
    --image-family=cos-stable \
    --image-project=cos-cloud \
    --container-image=ghcr.io/nipunac95/power-manager:latest \
    --container-restart-policy=always \
    --container-mount-host-path=host-path=/var/jkbms,mount-path=/app/data,mode=rw \
    --tags=http-server,https-server
```

---

## Architecture of the Single Docker Image on GCP

```
  ┌─────────────────────────────────────────────────────────────┐
  │                 GCP Compute Engine e2-micro                 │
  │                  (us-central1-a / 30GB Disk)                │
  │                                                             │
  │  Docker Container (jkbms-server)                           │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │  Port 80 / 3000                                       │  │
  │  │                                                       │  │
  │  │  1. Express Web Host: Serves Zed-themed React SPA     │  │
  │  │  2. Realtime WebSocket: ws://<IP>/api/ws              │  │
  │  │  3. REST Endpoints: /api/latest, /api/history         │  │
  │  │  4. MQTT Client: Background subscriber to             │  │
  │  │     broker.emqx.io (topic: jkbms/+/telemetry)         │  │
  │  │  5. Storage Engine:                                   │  │
  │  │     - Built-in SQLite at /app/data/jkbms.db (WAL)     │  │
  │  │     - Or Cloud PostgreSQL via DATABASE_URL            │  │
  │  └───────────────────────────────────────────────────────┘  │
  │                                                             │
  │  Persistent Host Volume: /opt/jkbms/data                    │
  └─────────────────────────────────────────────────────────────┘
```

---

## Verifying the Deployment

1. **Check Container Status**:
   ```bash
   sudo docker ps
   ```
2. **Check Logs**:
   ```bash
   sudo docker logs -f jkbms-server
   ```
   You should see:
   ```
   [MQTT] Connected successfully to mqtt://broker.emqx.io:1883
   [MQTT] Successfully subscribed to jkbms/+/telemetry
   [SERVER] JKBMS Standalone Server running at http://0.0.0.0:3000
   [SERVER] WebSocket available at ws://0.0.0.0:3000/api/ws
   [SERVER] Frontend web hosting available at http://0.0.0.0:3000/
   ```
3. **Open in Browser**:
   Navigate to:
   ```
   http://<YOUR_GCP_VM_EXTERNAL_IP>/
   ```
   The dashboard displays live voltages, current, pack power, SoC, temperature sensors, and dynamic runtime estimates directly from the ESP32!

