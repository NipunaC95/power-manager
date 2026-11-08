/**
 * ESP32 BLE to Cloudflare Bridge for JK-BMS
 * Based on cue108/jk-bms-opensearch-dashboard & syssi/esphome-jk-bms protocol
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <NimBLEDevice.h>
#include <ArduinoJson.h>

// ---------------------- Configuration ----------------------
const char* WIFI_SSID     = WIFI_SSID_STR;
const char* WIFI_PASSWORD = WIFI_PASSWORD_STR;

const char* CLOUDFLARE_URL = CLOUDFLARE_URL_STR;
const char* API_KEY        = API_KEY_STR; // Updated API key from .env







const String TARGET_SERIAL = "507268D28101263";

// Standard JK BLE UUIDs
static BLEUUID SERVICE_UUID("0000ffe0-0000-1000-8000-00805f9b34fb");
static BLEUUID CHAR_NOTIFY_UUID("0000ffe1-0000-1000-8000-00805f9b34fb");

// Callbacks will be defined later after globals

const uint8_t COMMAND_CELL_INFO   = 0x96;
const uint8_t COMMAND_DEVICE_INFO = 0x97;

// Frame Protocol Constants
const uint8_t FRAME_PREAMBLE[4] = { 0x55, 0xAA, 0xEB, 0x90 };
const size_t FRAME_SIZE = 300;
const uint8_t TYPE_CELL_INFO = 0x02;

// ---------------------- Global State ----------------------
static NimBLERemoteCharacteristic* pChar = nullptr;
static NimBLEClient* pClient = nullptr;
static NimBLEAdvertisedDevice* targetDevice = nullptr;

// BLE client callbacks to manage connection state
class MyClientCallbacks : public NimBLEClientCallbacks {
public:
  void onConnect(NimBLEClient* pclient) override {
    Serial.println("[BLE] Client connected");
  }
  void onDisconnect(NimBLEClient* pclient) override {
    Serial.println("[BLE] Client disconnected");
    pClient = nullptr;
    pChar = nullptr;
  }
};

unsigned long lastUploadTime = 0;
const unsigned long UPLOAD_INTERVAL_MS = 5000; // upload every 5 seconds

struct BmsData {
  float total_voltage = 0.0;
  float current = 0.0;
  int soc = 0;
  float capacity_remaining = 0.0;
  float temp_mos = 0.0;
  float temp_bat1 = 0.0;
  float temp_bat2 = 0.0;
  float cell_min = 0.0;
  float cell_max = 0.0;
  std::vector<float> cells;
  bool updated = false;
} bmsData;

std::vector<uint8_t> frameBuffer;

// ---------------------- Helper Math ----------------------
uint16_t u16(const uint8_t* b, size_t i) {
  return b[i] | (b[i + 1] << 8);
}

int16_t s16(const uint8_t* b, size_t i) {
  return (int16_t)(b[i] | (b[i + 1] << 8));
}

uint32_t u32(const uint8_t* b, size_t i) {
  return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
}

int32_t s32(const uint8_t* b, size_t i) {
  return (int32_t)(b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24));
}

// Build 20-byte request frame
void sendRequest(uint8_t reg) {
  if (!pChar) return;
  uint8_t frame[20];
  memset(frame, 0, 20);
  frame[0] = 0xAA;
  frame[1] = 0x55;
  frame[2] = 0x90;
  frame[3] = 0xEB;
  frame[4] = reg;
  
  uint16_t sum = 0;
  for (int i = 0; i < 19; i++) {
    sum += frame[i];
  }
  frame[19] = sum & 0xFF;

  pChar->writeValue(frame, sizeof(frame), false);
}

// ---------------------- Decode Cell Info (Dual-shift Aware) ----------------------
void decodeCellInfo(const uint8_t* frame) {
  // Determine dual-shift layout
  float cells[24];
  int liveCount = 0;
  float cellSum = 0;
  for (int i = 0; i < 24; i++) {
    cells[i] = u16(frame, 6 + i * 2) * 0.001;
    if (cells[i] > 1.0) {
      liveCount++;
      cellSum += cells[i];
    }
  }

  int head = 16;
  for (int h : {16, 0}) {
    uint32_t mask = u32(frame, 54 + h);
    if (liveCount && (mask & ((1 << liveCount) - 1)) == ((1 << liveCount) - 1)) {
      head = h;
      break;
    }
  }

  int tail = 16;
  float bestErr = 9999.0;
  for (int t : {16, 32}) {
    float pack = u32(frame, 118 + t) * 0.001;
    if (liveCount && (2.5 * liveCount <= pack && pack <= 4.3 * liveCount)) {
      float err = fabs(pack - cellSum);
      if (err < bestErr) {
        tail = t;
        bestErr = err;
      }
    }
  }

  bmsData.cells.clear();
  float minV = 99.0, maxV = 0.0;
  for (int i = 0; i < liveCount; i++) {
    float v = cells[i];
    bmsData.cells.push_back(v);
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  bmsData.cell_min = (minV < 90.0) ? minV : 0.0;
  bmsData.cell_max = maxV;
  bmsData.total_voltage = u32(frame, 118 + tail) * 0.001;
  bmsData.current = s32(frame, 126 + tail) * 0.001;
  bmsData.temp_mos = s16(frame, 112 + tail) * 0.1;
  bmsData.temp_bat1 = s16(frame, 130 + tail) * 0.1;
  bmsData.temp_bat2 = s16(frame, 132 + tail) * 0.1;
  bmsData.soc = frame[141 + tail];
  bmsData.capacity_remaining = u32(frame, 142 + tail) * 0.001;
  bmsData.updated = true;

  Serial.printf("[BMS LIVE] V=%.2fV I=%.2fA SOC=%d%% Cells=%d Tmos=%.1fC Tbat=%.1fC\n",
                bmsData.total_voltage, bmsData.current, bmsData.soc,
                bmsData.cells.size(), bmsData.temp_mos, bmsData.temp_bat1);
}

// ---------------------- Feed Frame Buffer ----------------------
void onNotify(NimBLERemoteCharacteristic* pChar, uint8_t* data, size_t length, bool isNotify) {
  if (length >= 4 && memcmp(data, FRAME_PREAMBLE, 4) == 0) {
    frameBuffer.clear();
  }
  frameBuffer.insert(frameBuffer.end(), data, data + length);

  if (frameBuffer.size() > 2 * FRAME_SIZE) {
    frameBuffer.clear();
  }

  while (frameBuffer.size() >= FRAME_SIZE) {
    uint8_t frame[FRAME_SIZE];
    memcpy(frame, frameBuffer.data(), FRAME_SIZE);
    frameBuffer.erase(frameBuffer.begin(), frameBuffer.begin() + FRAME_SIZE);

    uint8_t sum = 0;
    for (size_t i = 0; i < FRAME_SIZE - 1; i++) {
      sum += frame[i];
    }

    if (sum == frame[FRAME_SIZE - 1]) {
      uint8_t ftype = frame[4];
      if (ftype == TYPE_CELL_INFO) {
        decodeCellInfo(frame);
      }
    }
  }
}

// ---------------------- Cloudflare HTTP Upload ----------------------
void uploadToCloudflare() {
  if (WiFi.status() != WL_CONNECTED || !bmsData.updated) return;

  HTTPClient http;
  http.begin(CLOUDFLARE_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  DynamicJsonDocument doc(2048);
  doc["total_voltage"] = bmsData.total_voltage;
  doc["current"] = bmsData.current;
  doc["power"] = bmsData.total_voltage * bmsData.current;
  doc["soc"] = bmsData.soc;
  doc["capacity_remaining"] = bmsData.capacity_remaining;
  doc["cell_min_voltage"] = bmsData.cell_min;
  doc["cell_max_voltage"] = bmsData.cell_max;
  doc["cell_diff"] = bmsData.cell_max - bmsData.cell_min;
  doc["temp_mos"] = bmsData.temp_mos;
  doc["temp_battery_1"] = bmsData.temp_bat1;
  doc["temp_battery_2"] = bmsData.temp_bat2;

  JsonArray cellArr = doc.createNestedArray("cell_voltages");
  for (float cv : bmsData.cells) {
    cellArr.add(cv);
  }

  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);
  Serial.printf("[Cloudflare D1] HTTP Response: %d\n", httpCode);
  http.end();
}

// ---------------------- Setup & Main Loop ----------------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.printf("Connecting to Wi-Fi: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nWiFi connected! IP: %s\n", WiFi.localIP().toString().c_str());

  NimBLEDevice::init("ESP32_JK_BLE");
  pClient = NimBLEDevice::createClient();
  // Register our client callbacks
  pClient->setClientCallbacks(new MyClientCallbacks());
}

void loop() {
  if (!pClient || !pClient->isConnected()) {
    Serial.println("[BLE] Scanning for JK BMS peripheral...");
    NimBLEScan* pScan = NimBLEDevice::getScan();
    pScan->setActiveScan(true);
    pScan->setInterval(97);
    pScan->setWindow(67);
    NimBLEScanResults results = pScan->start(5, false);

    for (int i = 0; i < results.getCount(); i++) {
      NimBLEAdvertisedDevice device = results.getDevice(i);
      String devName = String(device.getName().c_str());
      String devAddr = String(device.getAddress().toString().c_str());
      bool hasSvc = device.isAdvertisingService(SERVICE_UUID);

      bool match = false;
      if (devName.indexOf(TARGET_SERIAL) >= 0 || devName == TARGET_SERIAL) {
        match = true;
      } else if (hasSvc) {
        match = true;
      } else if (devName.indexOf("JK") >= 0 || devName.indexOf("B1A8S") >= 0) {
        match = true;
      }

      if (match) {
        Serial.printf("[BLE] Found device '%s' [%s]. Connecting...\n", devName.c_str(), devAddr.c_str());
        if (pClient->connect(&device)) {
          Serial.println("[BLE] Connected! Locating FFE0 service...");
          NimBLERemoteService* pSvc = pClient->getService(SERVICE_UUID);
          if (pSvc) {
            pChar = pSvc->getCharacteristic(CHAR_NOTIFY_UUID);
            if (pChar && pChar->canNotify()) {
              pChar->subscribe(true, onNotify);
              Serial.println("[BLE] Subscribed to FFE1 notifications!");
              
              // Initial handshake queries from reference repo
              delay(500);
              sendRequest(COMMAND_DEVICE_INFO);
              delay(1000);
              sendRequest(COMMAND_CELL_INFO);
            }
          }
        }
        break;
      }
    }
  }

  // Periodic request (keep stream alive)
  if (pClient->isConnected()) {
    sendRequest(COMMAND_CELL_INFO);
  }

  // Upload to Cloudflare D1
  if (millis() - lastUploadTime > UPLOAD_INTERVAL_MS) {
    uploadToCloudflare();
    lastUploadTime = millis();
  }

  delay(2000);
}
