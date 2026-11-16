#!/usr/bin/env bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./deploy/sync_to_vm.sh <VM_PUBLIC_IP>"
  exit 1
fi

VM_IP="$1"
echo "=========================================================="
echo "  Deploying JK-BMS to Oracle Cloud VM: $VM_IP"
echo "=========================================================="

echo "[1/3] Syncing project files..."
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude 'frontend/node_modules' \
  --exclude '.git' \
  --exclude '.pio' \
  --exclude 'data/*.db*' \
  ./ "ubuntu@$VM_IP:~/jkbms/"

echo "[2/3] Launching Docker container on VM..."
ssh -o StrictHostKeyChecking=no "ubuntu@$VM_IP" "cd ~/jkbms && docker compose up -d --build"

echo "[3/3] Verifying server health..."
sleep 5
ssh -o StrictHostKeyChecking=no "ubuntu@$VM_IP" "curl -s http://127.0.0.1:3000/health || echo 'Starting up...'"

echo ""
echo "=========================================================="
echo "  DEPLOYMENT COMPLETE!"
echo "  Open Dashboard: http://$VM_IP"
echo "=========================================================="

