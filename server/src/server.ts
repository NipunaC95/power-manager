import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { BmsDatabase, EnrichedTelemetry } from './db';
import { MqttService } from './mqtt';

// Load .env from process.cwd() or root
const rootEnvPath = process.env.ENV_FILE || path.resolve(process.cwd(), '.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const API_KEY = process.env.API_KEY || '';

// Resolve public folder for static frontend hosting
function resolvePublicDir(): string {
  if (process.env.PUBLIC_DIR && fs.existsSync(process.env.PUBLIC_DIR)) {
    return path.resolve(process.env.PUBLIC_DIR);
  }
  const candidates = [
    path.resolve(process.cwd(), 'public'),
    path.resolve(__dirname, '../public'),
    path.resolve(__dirname, '../../public'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(process.cwd(), 'public');
}

const PUBLIC_DIR = resolvePublicDir();

console.log('====================================================');
console.log('   JK-BMS STANDALONE SERVER (MQTT + SOCKET + WEB)  ');
console.log('====================================================');
console.log(`Port           : ${PORT}`);
console.log(`Public Dir     : ${PUBLIC_DIR}`);
console.log(`Database File  : ${process.env.DB_PATH || path.resolve(process.cwd(), 'data/jkbms.db')}`);
console.log(`API Key auth   : ${API_KEY ? 'Enabled' : 'Disabled'}`);
console.log('----------------------------------------------------');

const app = express();
const server = http.createServer(app);

// Initialize SQLite database
const db = new BmsDatabase();

// ── WebSocket Server ───────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true });
const activeSockets = new Set<WebSocket>();

function broadcast(latest: EnrichedTelemetry) {
  const payload = JSON.stringify({ type: 'telemetry', latest });
  for (const client of activeSockets) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {
        activeSockets.delete(client);
      }
    }
  }
}

// Start MQTT Service and connect to broker
const mqttService = new MqttService(db, {
  onTelemetry: (latest) => {
    broadcast(latest);
  },
});
mqttService.start();

// Handle HTTP upgrade to WebSocket
server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

  if (pathname === '/api/ws' || pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', async (ws: WebSocket) => {
  activeSockets.add(ws);

  // Send initial data snapshot
  try {
    const latest = await db.getLatestTelemetry();
    const history = await db.getHistoryTelemetry(100);
    ws.send(JSON.stringify({ type: 'init', latest, history }));
  } catch (err: any) {
    console.error('[WS] Error sending initial payload:', err.message);
  }

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      } else if (data.type === 'refresh') {
        const latest = await db.getLatestTelemetry();
        const history = await db.getHistoryTelemetry(100);
        ws.send(JSON.stringify({ type: 'init', latest, history }));
      }
    } catch {}
  });

  ws.on('close', () => {
    activeSockets.delete(ws);
  });

  ws.on('error', () => {
    activeSockets.delete(ws);
  });
});

// Heartbeat ping every 25 seconds
setInterval(() => {
  const ping = JSON.stringify({ type: 'ping' });
  for (const client of activeSockets) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(ping);
      } catch {
        activeSockets.delete(client);
      }
    }
  }
}, 25000);

// ── Express Middleware ─────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ── REST API Endpoints ─────────────────────────────────────────

// GET /health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'jkbms-standalone',
    uptime: process.uptime(),
    activeSockets: activeSockets.size,
  });
});

// GET /api/latest
app.get('/api/latest', async (req, res) => {
  try {
    const latest = await db.getLatestTelemetry();
    res.json(latest || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/history?limit=100
app.get('/api/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string || '100', 10);
    const history = await db.getHistoryTelemetry(limit);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cells?cell=0&limit=200
app.get('/api/cells', async (req, res) => {
  try {
    const cellIndex = parseInt(req.query.cell as string || '0', 10);
    const limit = parseInt(req.query.limit as string || '200', 10);
    const data = await db.getCellHistory(cellIndex, limit);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cells/latest?limit=50
app.get('/api/cells/latest', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string || '50', 10);
    const data = await db.getLatestCells(limit);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.getSettings();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings
app.post('/api/settings', async (req, res) => {
  try {
    const updated = await db.updateSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/telemetry (Direct HTTP ingest fallback)
app.post('/api/telemetry', async (req, res) => {
  if (API_KEY) {
    const key = req.headers['x-api-key'];
    if (key !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const { id, latest } = await db.insertTelemetry(req.body);
    broadcast(latest);
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Static Web Hosting for Frontend ────────────────────────────
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  // SPA Fallback: serve index.html for any unhandled GET route
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    }
    next();
  });
} else {
  console.warn(`[WARN] Public directory not found: ${PUBLIC_DIR}`);
}

// ── Graceful Shutdown ──────────────────────────────────────────
const shutdown = () => {
  console.log('\n[SERVER] Shutting down gracefully...');
  mqttService.stop();
  for (const client of activeSockets) {
    client.close();
  }
  server.close(() => {
    console.log('[SERVER] Server closed.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ── Start HTTP & WebSocket Server ──────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] JKBMS Standalone Server running at http://0.0.0.0:${PORT}`);
  console.log(`[SERVER] WebSocket available at ws://0.0.0.0:${PORT}/api/ws`);
  console.log(`[SERVER] Frontend web hosting available at http://0.0.0.0:${PORT}/`);
});
