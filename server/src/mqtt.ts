import mqtt, { MqttClient } from 'mqtt';
import { BmsDatabase, EnrichedTelemetry } from './db';

export interface MqttServiceOptions {
  brokerUrl?: string;
  topic?: string;
  username?: string;
  password?: string;
  onTelemetry?: (latest: EnrichedTelemetry) => void;
}

export class MqttService {
  private client: MqttClient | null = null;
  private db: BmsDatabase;
  private options: MqttServiceOptions;

  constructor(db: BmsDatabase, options: MqttServiceOptions) {
    this.db = db;
    this.options = options;
  }

  public start() {
    const server = process.env.MQTT_SERVER || 'broker.emqx.io';
    const port = process.env.MQTT_PORT || '1883';
    const brokerUrl =
      this.options.brokerUrl ||
      process.env.MQTT_BROKER_URL ||
      `mqtt://${server}:${port}`;

    const topic = this.options.topic || process.env.MQTT_TOPIC || 'jkbms/+/telemetry';
    const username = this.options.username || process.env.MQTT_USER || undefined;
    const password = this.options.password || process.env.MQTT_PASSWORD || undefined;

    console.log(`[MQTT] Connecting to broker: ${brokerUrl}`);
    console.log(`[MQTT] Listening on topic: ${topic}`);

    this.client = mqtt.connect(brokerUrl, {
      clientId: `jkbms_server_${Math.random().toString(16).substring(2, 8)}`,
      username,
      password,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 3000,
    });

    this.client.on('connect', () => {
      console.log(`[MQTT] Connected successfully to ${brokerUrl}`);
      this.client?.subscribe(topic, (err) => {
        if (err) {
          console.error(`[MQTT] Subscription error on ${topic}:`, err.message);
        } else {
          console.log(`[MQTT] Successfully subscribed to ${topic}`);
        }
      });
    });

    this.client.on('message', async (msgTopic, message) => {
      try {
        const raw = message.toString();
        const data = JSON.parse(raw);

        // Insert into database (PostgreSQL on Render / SQLite locally)
        const { id, latest } = await this.db.insertTelemetry(data);

        const packV = latest.total_voltage?.toFixed(2) ?? '--';
        const cur = latest.current?.toFixed(2) ?? '--';
        const soc = latest.soc ?? '--';
        const cellCount = latest.cell_voltages?.length ?? 0;

        console.log(
          `[MQTT LIVE] [Record #${id}] Topic: ${msgTopic} | ${packV}V | ${cur}A | SOC: ${soc}% | Cells: ${cellCount}`
        );

        // Notify WebSocket manager to broadcast to connected clients
        if (this.options.onTelemetry) {
          this.options.onTelemetry(latest);
        }
      } catch (err: any) {
        console.error(`[MQTT] Error processing telemetry payload:`, err.message);
      }
    });

    this.client.on('error', (err) => {
      console.error(`[MQTT] Client error:`, err.message);
    });

    this.client.on('reconnect', () => {
      console.log(`[MQTT] Reconnecting to broker...`);
    });

    this.client.on('offline', () => {
      console.log(`[MQTT] Client offline`);
    });
  }

  public stop() {
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
  }
}

