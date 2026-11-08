import os
from pathlib import Path

Import("env")

def load_env():
    env_path = Path(env['PROJECT_DIR']) / '.env'
    if not env_path.is_file():
        print('⚠️ .env file not found')
        return
    with env_path.open() as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            key, _, value = line.partition('=')
            key = key.strip()
            value = value.strip()
            # Export to the process environment for ${sysenv.VAR} substitution
            os.environ[key] = value
            print(f'🔹 Loaded env var: {key}')

load_env()
