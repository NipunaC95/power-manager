#!/usr/bin/env bash
# ==============================================================================
# Automated GCP Always Free e2-micro VM Provisioning & Docker Deployment
# Run this from Google Cloud Shell or your local machine with gcloud installed.
# ==============================================================================

set -euo pipefail

INSTANCE_NAME="jkbms-free-vm"
ZONE="us-central1-a"
REGION="us-central1"
MACHINE_TYPE="e2-micro"      # GCP Always Free eligible
BOOT_DISK_SIZE="30GB"        # Max free standard persistent disk
BOOT_DISK_TYPE="pd-standard" # Standard persistent disk (Required for Free Tier)
IMAGE_FAMILY="ubuntu-2204-lts"
IMAGE_PROJECT="ubuntu-os-cloud"

echo "=========================================================="
echo "   GCP ALWAYS FREE TIER VM LAUNCHER (JK-BMS DOCKER)      "
echo "=========================================================="

# Check gcloud CLI
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed or not in PATH."
    echo "Install gcloud or run this directly inside Google Cloud Shell (https://shell.cloud.google.com)."
    exit 1
fi

PROJECT_ID=$(gcloud config get-value project 2>/dev/null || true)
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
    echo "Please set your default project: gcloud config set project <PROJECT_ID>"
    exit 1
fi

echo "Active GCP Project : $PROJECT_ID"
echo "Target Region/Zone : $ZONE (Always Free eligible)"
echo "Machine Type       : $MACHINE_TYPE (Always Free eligible)"
echo "Disk               : $BOOT_DISK_SIZE $BOOT_DISK_TYPE (Always Free eligible)"
echo "----------------------------------------------------------"

# 1. Create Firewall Rule for HTTP and Port 3000
echo "[1/3] Ensuring firewall rules exist for port 80 and 3000..."
if ! gcloud compute firewall-rules describe allow-jkbms-web --project="$PROJECT_ID" &>/dev/null; then
    gcloud compute firewall-rules create allow-jkbms-web \
        --project="$PROJECT_ID" \
        --direction=INGRESS \
        --priority=1000 \
        --network=default \
        --action=ALLOW \
        --rules=tcp:80,tcp:443,tcp:3000 \
        --source-ranges=0.0.0.0/0 \
        --target-tags=jkbms-server \
        --description="Allow inbound HTTP and custom ports for JK-BMS web UI"
    echo "Firewall rule created."
else
    echo "Firewall rule already exists."
fi

# 2. Check if VM already exists, otherwise create it
echo "[2/3] Checking Compute Engine VM instance '$INSTANCE_NAME'..."
if ! gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT_ID" &>/dev/null; then
    echo "Creating e2-micro Always Free VM instance..."
    gcloud compute instances create "$INSTANCE_NAME" \
        --project="$PROJECT_ID" \
        --zone="$ZONE" \
        --machine-type="$MACHINE_TYPE" \
        --boot-disk-size="$BOOT_DISK_SIZE" \
        --boot-disk-type="$BOOT_DISK_TYPE" \
        --image-family="$IMAGE_FAMILY" \
        --image-project="$IMAGE_PROJECT" \
        --tags=jkbms-server,http-server,https-server \
        --metadata=enable-oslogin=TRUE
    echo "Waiting 20 seconds for instance to initialize..."
    sleep 20
else
    echo "Instance '$INSTANCE_NAME' already exists."
fi

# 3. Retrieve External IP
EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" \
    --zone="$ZONE" \
    --project="$PROJECT_ID" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo "----------------------------------------------------------"
echo "VM Public IP: $EXTERNAL_IP"
echo "----------------------------------------------------------"

# 4. Deploy code onto VM via SSH
echo "[3/3] Deploying JK-BMS Docker container to the VM..."
gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT_ID" --command="
    set -e
    if [ ! -d ~/jkbms ]; then
        git clone https://github.com/NipunaC95/power-manager.git ~/jkbms
    else
        cd ~/jkbms && git fetch origin && git reset --hard origin/main
    fi
    cd ~/jkbms
    chmod +x deploy/gcp_vm_setup.sh
    ./deploy/gcp_vm_setup.sh
"

echo ""
echo "=========================================================="
echo "   DEPLOYMENT TO GCP ALWAYS FREE VM COMPLETE!            "
echo "=========================================================="
echo "Dashboard URL : http://$EXTERNAL_IP/"
echo "Health Check  : http://$EXTERNAL_IP/health"
echo "Live API      : http://$EXTERNAL_IP/api/latest"
echo "WebSocket     : ws://$EXTERNAL_IP/api/ws"
echo "=========================================================="
