/**
 * Local dev server for JK-BMS React frontend.
 *
 * - Serves static files from public/ (your React app)
 * - Proxies GET /api/* and WebSocket /api/ws requests to the Dashboard Worker
 * - Proxies POST /api/telemetry to the Ingest Worker
 * - esbuild watches for source changes and rebuilds bundle.js automatically
 *
 * Usage: npm run dev
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ── Upstream Worker URLs ────────────────────────────────────
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://jkbms-dashboard.vcode-fiverr.workers.dev';
const INGEST_URL = process.env.INGEST_URL || 'https://jkbms-cloud.vcode-fiverr.workers.dev';
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');
const PORT = 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.map':  'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ── 1) esbuild watch ────────────────────────────────────────
const esbuild = spawn('npx', [
  'esbuild', 'src/main.jsx',
  '--bundle',
  '--outfile=../public/bundle.js',
  '--loader:.js=jsx',
  '--loader:.jsx=jsx',
  '--sourcemap',
  '--watch',
], { cwd: FRONTEND_DIR, shell: true, stdio: 'pipe' });

esbuild.stdout.on('data', (d) => {
  const m = d.toString().trim();
  if (m) console.log(`\x1b[36m[build]\x1b[0m ${m}`);
});
esbuild.stderr.on('data', (d) => {
  const m = d.toString().trim();
  if (m) console.log(`\x1b[36m[build]\x1b[0m ${m}`);
});

// Helper: proxy an HTTP request to an upstream worker
function proxyRequest(targetBaseUrl, req, res) {
  const target = new URL(req.url, targetBaseUrl);
  const opts = {
    hostname: target.hostname,
    port: 443,
    path: target.pathname + target.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: target.hostname,
    },
  };
  delete opts.headers['connection'];
  delete opts.headers['transfer-encoding'];

  const proxy = https.request(opts, (upstream) => {
    const h = { ...upstream.headers };
    h['access-control-allow-origin'] = '*';
    res.writeHead(upstream.statusCode, h);
    upstream.pipe(res);
  });

  proxy.on('error', (err) => {
    console.error(`\x1b[31m[proxy error]\x1b[0m ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
    }
  });

  req.pipe(proxy);
}

// ── 2) Local HTTP Server ────────────────────────────────────
const server = http.createServer((req, res) => {
  // Route /api/* requests to the correct upstream worker:
  if (req.url.startsWith('/api/')) {
    // POST /api/telemetry -> Ingestion Worker
    if (req.method === 'POST' && req.url.startsWith('/api/telemetry')) {
      proxyRequest(INGEST_URL, req, res);
      return;
    }
    // All read/GET queries -> Dashboard Worker
    proxyRequest(DASHBOARD_URL, req, res);
    return;
  }

  // Serve static files from public/
  const safePath = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath === '/' ? 'index.html' : safePath);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
});

// ── 3) WebSocket Upgrade Proxy ──────────────────────────────
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/api/ws') || req.url.startsWith('/ws')) {
    const target = new URL(req.url, DASHBOARD_URL);
    const upstreamReq = https.request({
      hostname: target.hostname,
      port: 443,
      path: target.pathname + target.search,
      method: 'GET',
      headers: {
        ...req.headers,
        host: target.hostname,
        connection: 'Upgrade',
        upgrade: 'websocket',
      },
    });

    upstreamReq.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
      let headersStr = `HTTP/1.1 101 Switching Protocols\r\n`;
      for (const [k, v] of Object.entries(upstreamRes.headers)) {
        headersStr += `${k}: ${v}\r\n`;
      }
      headersStr += '\r\n';
      socket.write(headersStr);

      if (upstreamHead && upstreamHead.length > 0) socket.write(upstreamHead);
      if (head && head.length > 0) upstreamSocket.write(head);

      socket.pipe(upstreamSocket);
      upstreamSocket.pipe(socket);
    });

    upstreamReq.on('error', (err) => {
      console.error(`\x1b[31m[ws-proxy]\x1b[0m ${err.message}`);
      socket.destroy();
    });

    upstreamReq.end();
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log(`\x1b[33m⚡ JK-BMS Dev Server\x1b[0m`);
  console.log(`\x1b[33m   App:        http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[33m   Dashboard:  ${DASHBOARD_URL}\x1b[0m`);
  console.log(`\x1b[33m   Ingestion:  ${INGEST_URL}\x1b[0m`);
  console.log(`\x1b[33m   WebSocket:  ws://localhost:${PORT}/api/ws\x1b[0m`);
  console.log('');
  console.log('   Live D1 data connected. Edit files in frontend/src/ to rebuild.');
  console.log('');
});

// ── Cleanup ─────────────────────────────────────────────────
const cleanup = () => {
  esbuild.kill('SIGTERM');
  server.close();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

esbuild.on('close', (code) => {
  console.log(`\x1b[36m[build]\x1b[0m exited (${code})`);
  cleanup();
});
