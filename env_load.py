import os
from pathlib import Path

Import("env")

def load_env():
    project_dir = Path(env['PROJECT_DIR'])
    env_path = project_dir / '.env'
    if not env_path.is_file():
        print('⚠️ .env file not found at:', env_path)
        return

    vars_dict = {}
    with env_path.open() as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            key, _, value = line.partition('=')
            key = key.strip()
            value = value.strip()
            vars_dict[key] = value
            os.environ[key] = value

    print('🔹 Loaded secrets from .env (single source of truth)')

    # Generate config.h
    config_content = f'''/**
 * AUTO-GENERATED CONFIGURATION - DO NOT EDIT MANUALLY
 * Generated from root .env by env_load.py
 */

#pragma once

#define WIFI_SSID         "{vars_dict.get('WIFI_SSID', '')}"
#define WIFI_PASSWORD     "{vars_dict.get('WIFI_PASSWORD', '')}"

#define TARGET_SERIAL     "{vars_dict.get('TARGET_SERIAL', '507268D28101263')}"
#define TARGET_NAME       "{vars_dict.get('TARGET_NAME', '507268D28101263')}"

#define MQTT_SERVER       "{vars_dict.get('MQTT_SERVER', 'broker.emqx.io')}"
#define MQTT_PORT         {int(vars_dict.get('MQTT_PORT', 1883))}
#define MQTT_USER         "{vars_dict.get('MQTT_USER', '')}"
#define MQTT_PASS         "{vars_dict.get('MQTT_PASSWORD', '')}"
#define MQTT_TOPIC        "{vars_dict.get('MQTT_TOPIC', 'jkbms/telemetry')}"

#define CLOUDFLARE_URL    "{vars_dict.get('CLOUDFLARE_URL', '')}"
#define API_KEY           "{vars_dict.get('API_KEY', '')}"
'''

    for target_dir in [project_dir / 'src_pio', project_dir / 'esp32']:
        if target_dir.is_dir():
            config_file = target_dir / 'config.h'
            with config_file.open('w') as cf:
                cf.write(config_content)
            print(f'  ✅ Synchronized: {config_file.relative_to(project_dir)}')

load_env()
