/**
 * JK-BMS MQTT to Cloudflare D1 Ingestion Bridge
 *
 * Subscribes to MQTT telemetry topics published by the ESP32
 * and commits records to Cloudflare D1 via the Ingestion Worker.
 */

import mqtt from "mqtt";

const MQTT_BROKER = process.env.MQTT_BROKER_URL || "mqtt://broker.emqx.io:1883";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "jkbms/+/telemetry";
const INGEST_URL = process.env.CLOUDFLARE_URL || "https://jkbms-cloud.vcode-fiverr.workers.dev/api/telemetry";
const API_KEY = process.env.API_KEY || "5fedefec-82d6-4d92-b316-4d92c8704426";

console.log("=========================================");
console.log("   JK-BMS MQTT -> D1 DATABASE BRIDGE    ");
console.log("=========================================");
console.log(`Broker URL : ${MQTT_BROKER}`);
console.log(`Topic      : ${MQTT_TOPIC}`);
console.log(`Ingest URL : ${INGEST_URL}`);
console.log("-----------------------------------------");

const client = mqtt.connect(MQTT_BROKER, {
  clientId: `jkbms_bridge_${Math.random().toString(16).substring(2, 8)}`,
  clean: true,
  connectTimeout: 10000,
  reconnectPeriod: 3000,
});

client.on("connect", () => {
  console.log(`[MQTT] Connected to broker: ${MQTT_BROKER}`);
  client.subscribe(MQTT_TOPIC, (err) => {
    if (err) {
      console.error("[MQTT] Subscription error:", err.message);
    } else {
      console.log(`[MQTT] Subscribed to topic pattern: ${MQTT_TOPIC}`);
      console.log("[Bridge] Awaiting BMS telemetry from ESP32...");
    }
  });
});

client.on("message", async (topic, message) => {
  try {
    const raw = message.toString();
    const data = JSON.parse(raw);

    const packVolts = data.total_voltage?.toFixed(2) ?? "--";
    const current = data.current?.toFixed(2) ?? "--";
    const soc = data.soc ?? "--";
    const cellCount = Array.isArray(data.cell_voltages) ? data.cell_voltages.length : 0;

    console.log(`[MQTT IN] Topic: ${topic} | ${packVolts}V | ${current}A | SOC: ${soc}% | Cells: ${cellCount}`);

    // Commit to Cloudflare D1 via ingestion worker
    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: raw,
    });

    if (res.ok) {
      const respData = (await res.json()) as { success?: boolean; id?: number };
      console.log(`[D1 SUCCESS] Ingested to Database! Record ID: ${respData.id}`);
    } else {
      const errText = await res.text();
      console.error(`[D1 ERROR] HTTP ${res.status}: ${errText}`);
    }
  } catch (err: any) {
    console.error(`[Bridge Error] Failed to process message: ${err.message}`);
  }
});

client.on("error", (err) => {
  console.error("[MQTT] Client error:", err.message);
});

client.on("reconnect", () => {
  console.log("[MQTT] Reconnecting to broker...");
});

client.on("offline", () => {
  console.log("[MQTT] Client offline");
});
