#!/usr/bin/env bash
# ==============================================================================
# GCP Always Free e2-micro VM Setup Script for JK-BMS Docker Container
# Optimizes 1GB RAM instance with swap, installs Docker, and starts container
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "   JK-BMS GCP E2-MICRO ALWAYS FREE VM SETUP (DOCKER)     "
echo "=========================================================="

# 1. Configure 2GB Swap Memory (Essential for 1GB RAM e2-micro during build)
if [ ! -f /swapfile ]; then
    echo "[1/5] Creating 2GB swap file to prevent OOM on e2-micro..."
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "Swap allocated successfully."
else
    echo "[1/5] Swap already configured."
fi

# 2. Update System & Install Dependencies
echo "[2/5] Updating packages and installing prerequisites..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release git

# 3. Install Docker Engine if not installed
if ! command -v docker &> /dev/null; then
    echo "[3/5] Installing Docker Engine & Compose..."
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -aG docker "$USER"
    echo "Docker installed successfully."
else
    echo "[3/5] Docker is already installed."
fi

# 4. Create persistent data volume directory
echo "[4/5] Preparing persistent data folder..."
sudo mkdir -p /opt/jkbms/data
sudo chmod -R 777 /opt/jkbms/data

# 5. Build and launch single Docker container
echo "[5/5] Building and starting JK-BMS single Docker container..."
cd "$(dirname "$0")/.."

# Build and start container bound to host port 80 & 3000
sudo docker compose down --remove-orphans || true
sudo docker compose up -d --build

echo ""
echo "=========================================================="
echo "   JK-BMS CONTAINER DEPLOYED SUCCESSFULLY!                "
echo "=========================================================="
echo "Checking container health in 5 seconds..."
sleep 5
sudo docker ps --filter "name=jkbms-server"

echo ""
echo "Test endpoint: http://localhost/health"
curl -s http://localhost/health || curl -s http://localhost:3000/health || echo "Starting up..."
echo ""
echo "Access your BMS dashboard via: http://<YOUR_GCP_VM_EXTERNAL_IP>/"

