module.exports = {
  apps: [
    {
      name: 'jkbms-server',
      script: './dist/server.js',
      cwd: '/opt/jkbms',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};

