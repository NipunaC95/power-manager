# Oracle Cloud Infrastructure (OCI) Deployment Guide for JK-BMS

This guide walks you through deploying the standalone JK-BMS application to an **Oracle Cloud Always Free** Compute instance (Ubuntu 22.04 or 24.04 LTS).

The standalone server handles:
1. **MQTT Telemetry Ingestion:** Subscribes to the ESP32 BMS telemetry topic.
2. **Persistent Storage:** Transactional SQLite database (`bms_telemetry` & `cell_data`).
3. **Real-time WebSockets:** Live streaming (`/api/ws`) to all connected dashboard browsers.
4. **Web Hosting:** Serves the compiled React frontend directly on port `80`/`3000`.

---

## Step 1: Open Oracle Cloud Ingress Ports (Critical)

Oracle Cloud blocks all incoming ports by default in the Virtual Cloud Network (VCN) security list.

1. In the OCI Console, navigate to **Networking** → **Virtual Cloud Networks**.
2. Click your VCN → **Security Lists** → **Default Security List for...**.
3. Under **Ingress Rules**, click **Add Ingress Rules**:
   * **Source CIDR:** `0.0.0.0/0`
   * **IP Protocol:** `TCP`
   * **Destination Port Range:** `80, 443, 3000, 1883`
   * **Description:** `JK-BMS Web, WebSocket and MQTT`
4. Click **Add Ingress Rules**.

---

## Step 2: Open VM OS Firewall (iptables / ufw)

SSH into your Oracle Cloud VM:
```bash
ssh -i /path/to/private_key ubuntu@<YOUR_OCI_PUBLIC_IP>
```

Oracle Cloud Ubuntu images include strict `iptables` rules by default. Run:
```bash
# Allow HTTP, HTTPS, Port 3000, and MQTT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 1883 -j ACCEPT

# Save iptables rules across reboots
sudo apt-get update && sudo apt-get install -y netfilter-persistent iptables-persistent
sudo netfilter-persistent save
```

---

## Step 3: Deployment (Choose Method A or Method B)

### Method A: Docker Compose (Recommended)

1. **Install Docker & Docker Compose on the VM:**
   ```bash
   sudo apt-get update
   sudo apt-get install -y ca-certificates curl gnupg
   sudo install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   sudo chmod a+r /etc/apt/keyrings/docker.gpg
   echo \
     "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
     $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
     sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt-get update
   sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   sudo usermod -aG docker $USER
   newgrp docker
   ```

2. **Clone your repository:**
   ```bash
   git clone <YOUR_GIT_REPO_URL> /opt/jkbms
   cd /opt/jkbms
   ```

3. **Configure Environment:**
   ```bash
   cp .env.example .env
   nano .env
   ```
   Ensure `MQTT_SERVER=broker.emqx.io` (or `localhost` if running Mosquitto) and `MQTT_TOPIC` match your ESP32.

4. **Launch with Docker Compose:**
   ```bash
   docker compose up -d --build
   ```
   Check logs with:
   ```bash
   docker compose logs -f
   ```

---

### Method B: Native Node.js + PM2 + Nginx

1. **Install Node.js 20 LTS & Build Tools:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs build-essential nginx
   sudo npm install -g pm2
   ```

2. **Deploy Code:**
   ```bash
   sudo mkdir -p /opt/jkbms
   sudo chown -R ubuntu:ubuntu /opt/jkbms
   git clone <YOUR_GIT_REPO_URL> /opt/jkbms
   cd /opt/jkbms
   cp .env.example .env
   npm ci
   cd frontend && npm ci && cd ..
   npm run build:standalone
   ```

3. **Start with PM2 (Automatic Background Process):**
   ```bash
   pm2 start deploy/ecosystem.config.js
   pm2 save
   pm2 startup
   ```

4. **Configure Nginx Reverse Proxy (Port 80/443):**
   ```bash
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/jkbms
   sudo ln -s /etc/nginx/sites-available/jkbms /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t && sudo systemctl restart nginx
   ```

5. **(Optional) Free SSL via Let's Encrypt:**
   If you have a domain pointed to your Oracle Cloud IP:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

---

## Step 4: Verification

1. Open your browser and navigate to:
   ```
   http://<YOUR_OCI_PUBLIC_IP>
   ```
   You should see the dark-themed Zed UI JK-BMS Dashboard load immediately.

2. Check health:
   ```bash
   curl http://<YOUR_OCI_PUBLIC_IP>/health
   ```
   Expected response:
   ```json
   {"status":"ok","service":"jkbms-standalone","uptime":...,"activeSockets":...}
   ```

3. Power up the ESP32. As soon as it publishes telemetry to MQTT, the standalone server will insert the readings into SQLite and immediately push them over WebSocket to your browser.

