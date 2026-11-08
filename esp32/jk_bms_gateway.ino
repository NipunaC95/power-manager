#include <WiFi.h>
#include <HTTPClient.h>
#include <NimBLEDevice.h>
#include <ArduinoJson.h>

// ---------------------- Configuration ----------------------
const char* WIFI_SSID     = "SLT-Fiber-2.4G-9240";
const char* WIFI_PASSWORD = "9d80e972e!";

// Cloudflare Worker URL and Secret Token
const char* CLOUDFLARE_URL = "https://jkbms-cloud.vcode-fiverr.workers.dev/api/telemetry";
const char* API_KEY        = "5fedefec-82d6-4d92-b316-4d92c8704426";

// JK BMS Target
const String TARGET_NAME = "507268D28101263";

// Standard JK BMS UUIDs
static BLEUUID SERVICE_UUID("FFE0");
static BLEUUID CHAR_NOTIFY_UUID("FFE1");
static BLEUUID CHAR_WRITE_UUID("FFE2");

// ---------------------- Global State ----------------------
static NimBLERemoteCharacteristic* pWriteChar = nullptr;
static NimBLERemoteCharacteristic* pNotifyChar = nullptr;
static NimBLEClient* pClient = nullptr;

bool connectedToBms = false;                     // tracks BLE link state
unsigned long lastWifiCheck = 0;
unsigned long lastUploadTime = 0;
unsigned long lastReconnectAttempt = 0;
const unsigned long UPLOAD_INTERVAL_MS = 5000;   // 5 s   // 15 s
const unsigned long RECONNECT_COOLDOWN_MS = 3000; // 3 s back‑off

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

// ---------------------- BLE client callbacks ----------------------
class MyClientCallbacks : public NimBLEClientCallbacks {
public:
  void onConnect(NimBLEClient* pclient) override {
    connectedToBms = true;
    Serial.println("[BLE] Client connected");
  }
  void onDisconnect(NimBLEClient* pclient) override {
    Serial.println("[BLE] Client disconnected");
    uint8_t reason = pclient->getDisconnectReason();
    Serial.printf("[BLE] Disconnect reason: 0x%02X\n", reason);
    connectedToBms = false;
    pNotifyChar = nullptr;
    pWriteChar = nullptr;
    NimBLEDevice::deleteClient(pclient);
    pClient = nullptr;
  }
};

// ---------------------- Parse JK02_32S (V19) Frame ----------------------
void parseJKFrame(const uint8_t* data, size_t length) {
  frameBuffer.insert(frameBuffer.end(), data, data + length);

  // Look for JK header 0x4E 0x57 ("NW")
  while (frameBuffer.size() >= 300) {
    if (frameBuffer[0] != 0x4E || frameBuffer[1] != 0x57) {
      frameBuffer.erase(frameBuffer.begin());
      continue;
    }

    uint16_t expectedLen = (frameBuffer[2] << 8) | frameBuffer[3];
    if (frameBuffer.size() < (size_t)(expectedLen + 4)) {
      break;
    }

    size_t idx = 11;
    bmsData.cells.clear();
    float minV = 99.0, maxV = 0.0;

    while (idx < (size_t)(expectedLen)) {
      uint8_t tag = frameBuffer[idx++];
      if (tag == 0x79) { // Cell voltages block
        uint8_t cellLen = frameBuffer[idx++];
        uint8_t cellCount = cellLen / 3;
        for (int c = 0; c < cellCount; c++) {
          idx++; // cell number
          uint16_t mV = (frameBuffer[idx] << 8) | frameBuffer[idx + 1];
          idx += 2;
          float v = mV / 1000.0;
          if (v > 1.5 && v < 5.0) {
            bmsData.cells.push_back(v);
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
          }
        }
        bmsData.cell_min = (minV < 90.0) ? minV : 0.0;
        bmsData.cell_max = maxV;
      } else if (tag == 0x80) {
        bmsData.temp_mos = (int16_t)((frameBuffer[idx] << 8) | frameBuffer[idx + 1]);
        idx += 2;
      } else if (tag == 0x81) {
        bmsData.temp_bat1 = (int16_t)((frameBuffer[idx] << 8) | frameBuffer[idx + 1]);
        idx += 2;
      } else if (tag == 0x82) {
        bmsData.temp_bat2 = (int16_t)((frameBuffer[idx] << 8) | frameBuffer[idx + 1]);
        idx += 2;
      } else if (tag == 0x83) {
        bmsData.total_voltage = ((frameBuffer[idx] << 8) | frameBuffer[idx + 1]) / 100.0;
        idx += 2;
      } else if (tag == 0x84) {
        int16_t rawCur = (frameBuffer[idx] << 8) | frameBuffer[idx + 1];
        bmsData.current = (rawCur & 0x7FFF) / 100.0;
        if ((rawCur & 0x8000) == 0) bmsData.current = -bmsData.current;
        idx += 2;
      } else if (tag == 0x85) {
        bmsData.soc = frameBuffer[idx++];
      } else if (tag == 0x87) {
        bmsData.capacity_remaining = ((frameBuffer[idx] << 24) | (frameBuffer[idx + 1] << 16) |
                                      (frameBuffer[idx + 2] << 8) | frameBuffer[idx + 3]) / 1000.0;
        idx += 4;
      } else {
        idx++;
      }
    }

    bmsData.updated = true;
    Serial.printf("[BMS] Parsed: V=%.2fV Cur=%.2fA SOC=%d%% Cells=%d\n",
                  bmsData.total_voltage, bmsData.current, bmsData.soc, bmsData.cells.size());
    frameBuffer.erase(frameBuffer.begin(), frameBuffer.begin() + expectedLen + 4);
  }
}

void notifyCallback(NimBLERemoteCharacteristic* pChar, uint8_t* pData, size_t length, bool isNotify) {
  parseJKFrame(pData, length);
}

// Request all telemetry parameters from V19 JK‑BMS
void requestBmsData() {
  if (!pWriteChar) return;
  const uint8_t reqCmd[] = {
    0x4E, 0x57, 0x00, 0x13, 0x00, 0x00, 0x00, 0x00,
    0x06, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x68, 0x00, 0x00, 0x01, 0x29
  };
  pWriteChar->writeValue(reqCmd, sizeof(reqCmd), false);
}

// ---------------------- Upload to Cloudflare D1 ----------------------
void uploadToCloudflare() {
  if (WiFi.status() != WL_CONNECTED || !bmsData.updated) return;

  HTTPClient http;
  http.begin(CLOUDFLARE_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  DynamicJsonDocument doc(2048);
  doc["total_voltage"] = bmsData.total_voltage;
  doc["current"] = bmsData.current;
  doc["soc"] = bmsData.soc;
  doc["capacity_remaining"] = bmsData.capacity_remaining;
  doc["temp_mos"] = bmsData.temp_mos;
  doc["temp_battery_1"] = bmsData.temp_bat1;
  doc["temp_battery_2"] = bmsData.temp_bat2;
  doc["charging_enabled"] = 1;
  doc["discharging_enabled"] = 1;

  JsonArray cellArr = doc.createNestedArray("cell_voltages");
  for (float cv : bmsData.cells) {
    cellArr.add(cv);
  }

  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);
  Serial.printf("[HTTP] POST Code: %d\n", httpCode);
  http.end();
}

// ---------------------- Setup & Loop ----------------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nWiFi connected! IP: %s\n", WiFi.localIP().toString().c_str());

  NimBLEDevice::init("ESP32_JK_GATEWAY");
  NimBLEDevice::setPower(ESP_PWR_LVL_P9); // Max BLE transmission power
  // Create initial client (will be recreated on disconnect)
  pClient = NimBLEDevice::createClient();
  pClient->setClientCallbacks(new MyClientCallbacks());
}

void loop() {
  // ---------- BLE connection handling ----------
  if (!pClient || !pClient->isConnected()) {
    // Respect back‑off to avoid rapid reconnect loops that trigger BMS beeps
    if (millis() - lastReconnectAttempt < RECONNECT_COOLDOWN_MS) {
      // just wait
    } else {
      lastReconnectAttempt = millis();
      Serial.println("[BLE] Scanning for JK‑BMS …");
      NimBLEScan* pScan = NimBLEDevice::getScan();
      pScan->setActiveScan(true);
      pScan->setInterval(500);   // 0.5 s interval
      pScan->setWindow(450);    // 0.45 s window
      NimBLEScanResults results = pScan->start(6, false);

      for (int i = 0; i < results.getCount(); i++) {
        NimBLEAdvertisedDevice device = results.getDevice(i);
        String devName = String(device.getName().c_str());
        String devAddr = String(device.getAddress().toString().c_str());
        bool hasSvc = device.haveServiceUUID() && device.isAdvertisingService(SERVICE_UUID);
        bool match = false;
        if (devName.indexOf(TARGET_NAME) >= 0 || devName == TARGET_NAME) {
          match = true;
        } else if (hasSvc) {
          match = true;
        } else if (devName.indexOf("JK") >= 0 || devName.indexOf("B1A8S") >= 0) {
          match = true;
        }

        if (match) {
          Serial.printf("[BLE] Matching BMS Found: '%s' [%s] RSSI:%d\n",
                        devName.c_str(), devAddr.c_str(), device.getRSSI());
          // Ensure a client exists
          if (!pClient) {
            pClient = NimBLEDevice::createClient();
            pClient->setClientCallbacks(new MyClientCallbacks());
          }
          if (pClient->connect(&device)) {
            Serial.println("[BLE] Connected! Discovering services...");
            NimBLERemoteService* pSvc = pClient->getService(SERVICE_UUID);
            if (pSvc) {
              pNotifyChar = pSvc->getCharacteristic(CHAR_NOTIFY_UUID);
              pWriteChar = pSvc->getCharacteristic(CHAR_WRITE_UUID);
              if (pNotifyChar && pNotifyChar->canNotify()) {
                pNotifyChar->subscribe(true, notifyCallback);
                Serial.println("[BLE] Subscribed to BMS notifications!");
              }
            }
          }
          break; // stop scanning after first match
        }
      }
    }
  }

  // ---------- Data request ----------
  if (pClient && pClient->isConnected()) {
    requestBmsData();
  }

  // ---------- Wi‑Fi status check (every 10 s) ----------
  if (millis() - lastWifiCheck >= 10000) {
    Serial.print("[WiFi] Status: ");
    Serial.println(WiFi.status() == WL_CONNECTED ? "connected" : "disconnected");
    lastWifiCheck = millis();
  }

  // ---------- Cloudflare upload (every 15 s) ----------
  if (millis() - lastUploadTime >= UPLOAD_INTERVAL_MS) {
    uploadToCloudflare();
    lastUploadTime = millis();
  }

  delay(2000);
}
