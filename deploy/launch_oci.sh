#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "    JK-BMS Oracle Cloud Automated Clean & Deploy Script   "
echo "=========================================================="

# 1. Fetch Compartment & Availability Domain
echo "[1/5] Resolving Tenancy & Availability Domain..."
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
echo "[2/5] Cleaning up previous JK-BMS resources..."

OLD_INSTANCES=$(oci compute instance list --compartment-id "$COMPARTMENT_ID" --display-name "jkbms-server" --query "data[?\"lifecycle-state\"!='TERMINATED'].id" --raw-output 2>/dev/null || true)

for INST_ID in $OLD_INSTANCES; do
  if [ -n "$INST_ID" ] && [ "$INST_ID" != "None" ] && [ "$INST_ID" != "null" ]; then
    echo "  -> Terminating existing instance: $INST_ID..."
    oci compute instance terminate --instance-id "$INST_ID" --preserve-boot-volume false --force >/dev/null 2>&1 || true
    echo "  -> Waiting for instance termination..."
    while true; do
      STATE=$(oci compute instance get --instance-id "$INST_ID" --query 'data."lifecycle-state"' --raw-output 2>/dev/null || echo "TERMINATED")
      [ "$STATE" == "TERMINATED" ] || [ -z "$STATE" ] && break
      sleep 5
    done
    echo "  -> Instance terminated."
  fi
done

# Cleanup old network components if they exist
OLD_SUBNETS=$(oci network subnet list --compartment-id "$COMPARTMENT_ID" --display-name "jkbms-subnet" --lifecycle-state AVAILABLE --query "data[*].id" --raw-output 2>/dev/null || true)
for SNET_ID in $OLD_SUBNETS; do
  [ -n "$SNET_ID" ] && [ "$SNET_ID" != "None" ] && oci network subnet delete --subnet-id "$SNET_ID" --force >/dev/null 2>&1 || true
done

OLD_IGS=$(oci network internet-gateway list --compartment-id "$COMPARTMENT_ID" --display-name "jkbms-ig" --lifecycle-state AVAILABLE --query "data[*].id" --raw-output 2>/dev/null || true)
for IG in $OLD_IGS; do
  [ -n "$IG" ] && [ "$IG" != "None" ] && oci network internet-gateway delete --ig-id "$IG" --force >/dev/null 2>&1 || true
done

OLD_VCNS=$(oci network vcn list --compartment-id "$COMPARTMENT_ID" --display-name "jkbms-vcn" --lifecycle-state AVAILABLE --query "data[*].id" --raw-output 2>/dev/null || true)
for VCN in $OLD_VCNS; do
  [ -n "$VCN" ] && [ "$VCN" != "None" ] && oci network vcn delete --vcn-id "$VCN" --force >/dev/null 2>&1 || true
done

echo "  Cleanup finished."

# -----------------------------------------------------------------------------
# STEP 3: CREATE VCN, INTERNET GATEWAY & SUBNET (Ports 80, 443, 3000, 1883 Open)
# -----------------------------------------------------------------------------
echo "[3/5] Creating VCN, Internet Gateway, and Subnet..."

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
echo "[4/5] Preparing SSH Key & Cloud-Init..."
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
# STEP 5: FIND ALWAYS-FREE IMAGE & LAUNCH INSTANCE
# -----------------------------------------------------------------------------
echo "[5/5] Finding Always-Free Ubuntu 22.04 Image and Launching..."

SHAPE="VM.Standard.E2.1.Micro"

IMAGE_ID=$(oci compute image list \
  --compartment-id "$COMPARTMENT_ID" \
  --operating-system "Canonical Ubuntu" \
  --operating-system-version "22.04" \
  --shape "$SHAPE" \
  --sort-by TIMECREATED --sort-order DESC \
  --query "data[0].id" --raw-output)

echo "  Target Shape : $SHAPE (Always Free AMD x86)"
echo "  Image OCID   : $IMAGE_ID"
echo "  Launching instance now..."

INSTANCE_JSON=$(oci compute instance launch \
  --compartment-id "$COMPARTMENT_ID" \
  --availability-domain "$AVAILABILITY_DOMAIN" \
  --shape "$SHAPE" \
  --boot-volume-size-in-gbs 50 \
  --image-id "$IMAGE_ID" \
  --subnet-id "$SUBNET_ID" \
  --display-name "jkbms-server" \
  --assign-public-ip true \
  --ssh-authorized-keys-file ~/.ssh/id_rsa.pub \
  --user-data-file /tmp/user_data.sh)

INSTANCE_ID=$(echo "$INSTANCE_JSON" | grep -o 'ocid1\.instance\.[^"]*' | head -n 1)

if [ -z "$INSTANCE_ID" ]; then
  echo ""
  echo "❌ Error: Instance creation did not return an instance OCID!"
  echo "OCI Output was:"
  echo "$INSTANCE_JSON"
  exit 1
fi

echo ""
echo "Instance Created: $INSTANCE_ID"
echo "Waiting for instance to reach RUNNING state..."

# Wait for instance to actually reach RUNNING state
oci compute instance get --instance-id "$INSTANCE_ID" --wait-for-state RUNNING --max-wait-seconds 120 >/dev/null

echo "Instance is RUNNING!"
echo "Fetching Public IP address..."
PUBLIC_IP=$(oci compute instance list-vnics --instance-id "$INSTANCE_ID" --query 'data[0]."public-ip"' --raw-output)

echo ""
echo "=========================================================="
echo "  🎉 INSTANCE IS UP AND RUNNING!"
echo "  Instance OCID : $INSTANCE_ID"
echo "  Public IP     : $PUBLIC_IP"
echo "  SSH Command   : ssh ubuntu@$PUBLIC_IP"
echo "=========================================================="
