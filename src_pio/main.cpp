/**
 * ESP32 BLE to MQTT Bridge for JK-BMS
 * Based on cue108/jk-bms-opensearch-dashboard & syssi/esphome-jk-bms protocol
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <NimBLEDevice.h>
#include <ArduinoJson.h>

// ---------------------- Configuration ----------------------
const char* WIFI_SSID     = "SLT-Fiber-2.4G-9240";
const char* WIFI_PASSWORD = "9d80e972e!";

// Target BMS Serial / Name
const String TARGET_SERIAL = "507268D28101263";

// Standard JK BLE UUIDs
static BLEUUID SERVICE_UUID("0000ffe0-0000-1000-8000-00805f9b34fb");
static BLEUUID CHAR_NOTIFY_UUID("0000ffe1-0000-1000-8000-00805f9b34fb");

// ---------------------- MQTT Configuration ----------------------
// Set to your MQTT broker address (e.g. "broker.emqx.io", "test.mosquitto.org", or local IP e.g. "192.168.1.100")
const char* MQTT_SERVER   = "broker.emqx.io";
const int   MQTT_PORT     = 1883;
const char* MQTT_USER     = "";
const char* MQTT_PASS     = "";
const char* MQTT_TOPIC    = "jkbms/507268D28101263/telemetry";

const uint8_t COMMAND_CELL_INFO   = 0x96;
const uint8_t COMMAND_DEVICE_INFO = 0x97;

// Frame Protocol Constants
const uint8_t FRAME_PREAMBLE[4] = { 0x55, 0xAA, 0xEB, 0x90 };
const size_t FRAME_SIZE = 300;
const uint8_t TYPE_CELL_INFO = 0x02;

// ---------------------- Global State ----------------------
static NimBLERemoteCharacteristic* pChar = nullptr;
static NimBLEClient* pClient = nullptr;
WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastUploadTime = 0;
const unsigned long UPLOAD_INTERVAL_MS = 5000; // Publish every 5 seconds
unsigned long lastMqttReconnect = 0;
unsigned long lastNotificationTime = 0;

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
    lastNotificationTime = 0;
  }
};

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
  lastNotificationTime = millis();

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

// ---------------------- MQTT Reconnect ----------------------
void ensureMqttConnected() {
  if (mqttClient.connected()) return;

  if (millis() - lastMqttReconnect < 5000) return;
  lastMqttReconnect = millis();

  Serial.printf("[MQTT] Connecting to broker %s:%d...\n", MQTT_SERVER, MQTT_PORT);
  String clientId = "ESP32_JKBMS_" + String((uint32_t)ESP.getEfuseMac(), HEX);

  bool ok = false;
  if (strlen(MQTT_USER) > 0) {
    ok = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
  } else {
    ok = mqttClient.connect(clientId.c_str());
  }

  if (ok) {
    Serial.println("[MQTT] Connected successfully!");
  } else {
    Serial.printf("[MQTT] Connection failed, rc=%d. Retrying in 5s...\n", mqttClient.state());
  }
}

// ---------------------- MQTT Telemetry Publish ----------------------
void publishMqttTelemetry() {
  if (!mqttClient.connected() || !bmsData.updated) return;

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

  bool published = mqttClient.publish(MQTT_TOPIC, payload.c_str());
  if (published) {
    Serial.printf("[MQTT] Published %u bytes to %s\n", payload.length(), MQTT_TOPIC);
  } else {
    Serial.println("[MQTT] Publish failed (check buffer size or connection)!");
  }
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

  // Configure MQTT client
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setBufferSize(2048); // Allow large JSON payload with 24 cell voltages

  NimBLEDevice::init("ESP32_JK_BLE");
  pClient = NimBLEDevice::createClient();
  pClient->setClientCallbacks(new MyClientCallbacks());
}

void loop() {
  // 1. Maintain MQTT connection
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      ensureMqttConnected();
    } else {
      mqttClient.loop();
    }
  }

  // 2. Manage BLE connection
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

          // Set supervision timeout to 10 seconds to avoid connection drops
          pClient->setConnectionParams(16, 32, 0, 1000);

          NimBLERemoteService* pSvc = pClient->getService(SERVICE_UUID);
          if (pSvc) {
            pChar = pSvc->getCharacteristic(CHAR_NOTIFY_UUID);
            if (pChar && pChar->canNotify()) {
              pChar->subscribe(true, onNotify);
              Serial.println("[BLE] Subscribed to FFE1 notifications!");
              
              // Initial handshake queries: causes exactly the 2 startup beeps (just like official app)
              delay(500);
              sendRequest(COMMAND_DEVICE_INFO); // 1st beep
              delay(1000);
              sendRequest(COMMAND_CELL_INFO);   // 2nd beep -> starts continuous notification stream
              lastNotificationTime = millis();
            }
          }
        }
        break;
      }
    }
  }

  // 3. Keep stream alive ONLY IF notifications stalled > 30 seconds
  // The BMS automatically streams notifications once started.
  // DO NOT send sendRequest in the loop - doing so is what triggers the repetitive single beeps!
  if (pClient && pClient->isConnected()) {
    if (lastNotificationTime > 0 && (millis() - lastNotificationTime > 30000)) {
      Serial.println("[BLE] Notification stream silent for >30s, sending keepalive query...");
      sendRequest(COMMAND_CELL_INFO);
      lastNotificationTime = millis();
    }
  }

  // 4. Publish MQTT Telemetry every UPLOAD_INTERVAL_MS
  if (millis() - lastUploadTime >= UPLOAD_INTERVAL_MS) {
    publishMqttTelemetry();
    lastUploadTime = millis();
  }

  delay(50); // Yield to BLE and Wi-Fi background stacks
}
