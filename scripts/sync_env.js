/**
 * sync_env.js
 * Reads .env (single source of truth) and synchronizes configurations to:
 * 1. esp32/config.h (for Arduino IDE)
 * 2. src_pio/config.h (for PlatformIO)
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

if (!fs.existsSync(envPath)) {
  console.warn('⚠️  .env file not found at:', envPath);
  process.exit(0);
}

const envConfig = dotenv.parse(fs.readFileSync(envPath, 'utf8'));

console.log('🔄 Syncing secrets & configs from .env as source of truth...');

// 1. Generate C/C++ header for ESP32 (Arduino IDE & PlatformIO)
const configHeader = `/**
 * AUTO-GENERATED CONFIGURATION - DO NOT EDIT MANUALLY
 * Generated from root .env by scripts/sync_env.js
 * Source of truth: .env
 */

#pragma once

#define WIFI_SSID         "${envConfig.WIFI_SSID || ''}"
#define WIFI_PASSWORD     "${envConfig.WIFI_PASSWORD || ''}"

#define TARGET_SERIAL     "${envConfig.TARGET_SERIAL || '507268D28101263'}"
#define TARGET_NAME       "${envConfig.TARGET_NAME || envConfig.TARGET_SERIAL || 'JK-BMS'}"

#define MQTT_SERVER       "${envConfig.MQTT_SERVER || 'broker.emqx.io'}"
#define MQTT_PORT         ${parseInt(envConfig.MQTT_PORT || '1883', 10)}
#define MQTT_USER         "${envConfig.MQTT_USER || ''}"
#define MQTT_PASS         "${envConfig.MQTT_PASSWORD || ''}"
#define MQTT_TOPIC        "${envConfig.MQTT_TOPIC || 'jkbms/507268D28101263/telemetry'}"

#define SERVER_URL        "${envConfig.SERVER_URL || 'http://136.80.228.184/api/telemetry'}"
#define API_KEY           "${envConfig.API_KEY || ''}"
`;

// Write to esp32/config.h
const esp32ConfigPath = path.join(rootDir, 'esp32', 'config.h');
fs.writeFileSync(esp32ConfigPath, configHeader, 'utf8');
console.log('  ✅ Generated:', path.relative(rootDir, esp32ConfigPath));

// Write to src_pio/config.h
const pioConfigPath = path.join(rootDir, 'src_pio', 'config.h');
fs.writeFileSync(pioConfigPath, configHeader, 'utf8');
console.log('  ✅ Generated:', path.relative(rootDir, pioConfigPath));

console.log('✨ All firmware components successfully synchronized with .env!');
