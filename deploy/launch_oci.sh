#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "    JK-BMS Oracle Cloud Automated Clean & Deploy Script   "
echo "=========================================================="

# 1. Fetch Compartment & Availability Domain
echo "[1/6] Resolving Tenancy & Availability Domain..."
COMPARTMENT_ID="${OCI_TENANCY}"

if [ -z "$COMPARTMENT_ID" ] || [ "$COMPARTMENT_ID" == "null" ]; then
  COMPARTMENT_ID=$(oci os ns get-metadata --query 'data."default-compartment-id"' --raw-output 2>/dev/null || true)
fi

if [ -z "$COMPARTMENT_ID" ] || [ "$COMPARTMENT_ID" == "null" ]; then
  NS=$(oci os ns get --query "data" --raw-output)
  COMPARTMENT_ID=$(oci iam tenancy get --tenancy-id "$NS" --query "data.id" --raw-output 2>/dev/null || true)
fi

if [ -z "$COMPARTMENT_ID" ]; then
  echo "Error: Could not determine Tenancy / Compartment ID."
  echo "Please set it manually: export COMPARTMENT_ID=ocid1.tenancy.oc1..your_tenancy_ocid"
  exit 1
fi

echo "  Compartment OCID   : $COMPARTMENT_ID"

AVAILABILITY_DOMAIN=$(oci iam availability-domain list --compartment-id "$COMPARTMENT_ID" --query "data[0].name" --raw-output)
echo "  Availability Domain: $AVAILABILITY_DOMAIN"

# -----------------------------------------------------------------------------
# STEP 2: REMOVE PREVIOUS JK-BMS RESOURCES (Instances, Subnets, Gateways, VCNs)
# -----------------------------------------------------------------------------
echo "[2/6] Checking for previous JK-BMS resources..."

# 2.1 Terminate existing jkbms-server instances
OLD_INSTANCES=$(oci compute instance list --compartment-id "$COMPARTMENT_ID" --display-name "jkbms-server" --query "data[?\"lifecycle-state\"!='TERMINATED'].id" --raw-output 2>/dev/null || true)

for INST_ID in $OLD_INSTANCES; do
  if [ -n "$INST_ID" ] && [ "$INST_ID" != "None" ] && [ "$INST_ID" != "null" ]; then
    echo "  -> Terminating existing instance: $INST_ID..."
    oci compute instance terminate --instance-id "$INST_ID" --preserve-boot-volume false --force >/dev/null
    echo "  -> Waiting for instance termination..."
    while true; do
      STATE=$(oci compute instance get --instance-id "$INST_ID" --query 'data."lifecycle-state"' --raw-output 2>/dev/null || echo "TERMINATED")
      [ "$STATE" == "TERMINATED" ] || [ -z "$STATE" ] && break
      sleep 5
    done
    echo "  -> Instance terminated."
  fi
done

# 2.2 Delete existing jkbms-subnet
OLD_SUBNETS=$(oci network subnet list --compartment-id "$COMPARTMENT_ID" --display-name "jkbms-subnet" --lifecycle-state AVAILABLE --query "data[*].id" --raw-output 2>/dev/null || true)
for SNET_ID in $OLD_SUBNETS; do
  if [ -n "$SNET_ID" ] && [ "$SNET_ID" != "None" ]; then
    echo "  -> Deleting previous subnet ($SNET_ID)..."
    oci network subnet delete --subnet-id "$SNET_ID" --force >/dev/null 2>&1 || true
  fi
done

# 2.3 Delete existing jkbms-ig (Internet Gateway)
OLD_IGS=$(oci network internet-gateway list --compartment-id "$COMPARTMENT_ID" --display-name "jkbms-ig" --lifecycle-state AVAILABLE --query "data[*].id" --raw-output 2>/dev/null || true)
for IG in $OLD_IGS; do
  if [ -n "$IG" ] && [ "$IG" != "None" ]; then
    echo "  -> Deleting previous Internet Gateway ($IG)..."
    oci network internet-gateway delete --ig-id "$IG" --force >/dev/null 2>&1 || true
  fi
done

# 2.4 Delete existing jkbms-vcn
OLD_VCNS=$(oci network vcn list --compartment-id "$COMPARTMENT_ID" --display-name "jkbms-vcn" --lifecycle-state AVAILABLE --query "data[*].id" --raw-output 2>/dev/null || true)
for VCN in $OLD_VCNS; do
  if [ -n "$VCN" ] && [ "$VCN" != "None" ]; then
    echo "  -> Deleting previous VCN ($VCN)..."
    oci network vcn delete --vcn-id "$VCN" --force >/dev/null 2>&1 || true
  fi
done

echo "  Cleanup finished."

# -----------------------------------------------------------------------------
# STEP 3: CREATE VCN, INTERNET GATEWAY & SUBNET (Ports 80, 443, 3000, 1883 Open)
# -----------------------------------------------------------------------------
echo "[3/6] Creating VCN, Internet Gateway, and Subnet..."

VCN_ID=$(oci network vcn create --compartment-id "$COMPARTMENT_ID" --cidr-block "10.0.0.0/16" --display-name "jkbms-vcn" --query "data.id" --raw-output)
echo "  Created VCN: $VCN_ID"

IG_ID=$(oci network internet-gateway create --compartment-id "$COMPARTMENT_ID" --is-enabled true --vcn-id "$VCN_ID" --display-name "jkbms-ig" --query "data.id" --raw-output)
echo "  Created Internet Gateway: $IG_ID"

RT_ID=$(oci network route-table list --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --query "data[0].id" --raw-output)
oci network route-table update --rt-id "$RT_ID" --route-rules "[{\"cidrBlock\":\"0.0.0.0/0\",\"networkEntityId\":\"$IG_ID\"}]" --force >/dev/null

SL_ID=$(oci network security-list list --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --query "data[0].id" --raw-output)
oci network security-list update --security-list-id "$SL_ID" --ingress-security-rules '[
  {"protocol": "6", "source": "0.0.0.0/0", "tcpOptions": {"destinationPortRange": {"max": 22, "min": 22}}},
  {"protocol": "6", "source": "0.0.0.0/0", "tcpOptions": {"destinationPortRange": {"max": 80, "min": 80}}},
  {"protocol": "6", "source": "0.0.0.0/0", "tcpOptions": {"destinationPortRange": {"max": 443, "min": 443}}},
  {"protocol": "6", "source": "0.0.0.0/0", "tcpOptions": {"destinationPortRange": {"max": 3000, "min": 3000}}},
  {"protocol": "6", "source": "0.0.0.0/0", "tcpOptions": {"destinationPortRange": {"max": 1883, "min": 1883}}}
]' --force >/dev/null

SUBNET_ID=$(oci network subnet create --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --cidr-block "10.0.0.0/24" --display-name "jkbms-subnet" --query "data.id" --raw-output)
echo "  Created Subnet: $SUBNET_ID"

# -----------------------------------------------------------------------------
# STEP 4: PREPARE SSH KEY & CLOUD-INIT BOOTSTRAP
# -----------------------------------------------------------------------------
echo "[4/6] Preparing SSH Key & Cloud-Init..."
if [ ! -f ~/.ssh/id_rsa.pub ]; then
  mkdir -p ~/.ssh
  ssh-keygen -t rsa -N "" -f ~/.ssh/id_rsa -q
fi

cat << 'EOF' > /tmp/user_data.sh
#!/bin/bash
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 1883 -j ACCEPT
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent docker.io docker-compose-v2
netfilter-persistent save
systemctl enable --now docker
usermod -aG docker ubuntu
EOF

# -----------------------------------------------------------------------------
# STEP 5 & 6: LAUNCH INSTANCE (WITH AUTOMATIC CAPACITY FALLBACK)
# -----------------------------------------------------------------------------
echo "[5/6] Locating Image & Launching Always-Free Instance..."

launch_instance() {
  local target_shape="$1"
  local shape_cfg="$2"

  echo "  Searching for Ubuntu 22.04 LTS image for shape $target_shape..."
  local img_id
  img_id=$(oci compute image list \
    --compartment-id "$COMPARTMENT_ID" \
    --operating-system "Canonical Ubuntu" \
    --operating-system-version "22.04" \
    --shape "$target_shape" \
    --sort-by TIMECREATED --sort-order DESC \
    --query "data[0].id" --raw-output 2>/dev/null || true)

  if [ -z "$img_id" ] || [ "$img_id" == "None" ] || [ "$img_id" == "null" ]; then
    echo "  Image not found for $target_shape"
    return 1
  fi

  echo "  Attempting launch of $target_shape..."
  local inst_id
  inst_id=$(eval oci compute instance launch \
    --compartment-id "$COMPARTMENT_ID" \
    --availability-domain "\"$AVAILABILITY_DOMAIN\"" \
    --shape "$target_shape" \
    $shape_cfg \
    --boot-volume-size-in-gbs 50 \
    --image-id "$img_id" \
    --subnet-id "$SUBNET_ID" \
    --display-name "jkbms-server" \
    --assign-public-ip true \
    --ssh-authorized-keys-file ~/.ssh/id_rsa.pub \
    --user-data-file /tmp/user_data.sh \
    --query "data.id" --raw-output 2>&1) || true

  if echo "$inst_id" | grep -qi "Out of host capacity"; then
    echo "  -> Notice: $target_shape is out of host capacity in this region."
    return 1
  elif echo "$inst_id" | grep -qi "ServiceError"; then
    echo "  -> Error launching $target_shape: $inst_id"
    return 1
  fi

  echo "$inst_id"
  return 0
}

INSTANCE_ID=""

# If user specified PREFERRED_SHAPE, try that first
if [ -n "$PREFERRED_SHAPE" ]; then
  echo "Trying user-preferred shape: $PREFERRED_SHAPE"
  INSTANCE_ID=$(launch_instance "$PREFERRED_SHAPE" "") || true
fi

# Try AMD x86 Always Free (VM.Standard.E2.1.Micro) first if ARM is congested, or fallback
if [ -z "$INSTANCE_ID" ]; then
  echo "[6/6] Launching Always-Free AMD x86 instance (VM.Standard.E2.1.Micro)..."
  INSTANCE_ID=$(launch_instance "VM.Standard.E2.1.Micro" "") || true
fi

# If Micro is somehow full, try ARM A1.Flex (2 OCPU / 12 GB RAM)
if [ -z "$INSTANCE_ID" ]; then
  echo "Trying ARM Always-Free shape (VM.Standard.A1.Flex)..."
  INSTANCE_ID=$(launch_instance "VM.Standard.A1.Flex" "--shape-config '{\"ocpus\": 2, \"memoryInGBs\": 12}'") || true
fi

if [ -z "$INSTANCE_ID" ]; then
  echo "Error: Could not launch either VM.Standard.E2.1.Micro or VM.Standard.A1.Flex due to capacity constraints in this availability domain."
  exit 1
fi

echo ""
echo "=========================================================="
echo "  INSTANCE LAUNCHED SUCCESSFULLY!"
echo "  Instance OCID : $INSTANCE_ID"
echo "=========================================================="
echo "Fetching Public IP address (waiting ~15 seconds)..."
sleep 15

PUBLIC_IP=$(oci compute instance list-vnics --instance-id "$INSTANCE_ID" --query 'data[0]."public-ip"' --raw-output 2>/dev/null || echo "Pending...")

echo "  Public IP   : $PUBLIC_IP"
echo "  Connect via : ssh ubuntu@$PUBLIC_IP"
echo "=========================================================="
