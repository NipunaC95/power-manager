/**
 * Local dev server for JK-BMS React frontend.
 *
 * - Serves static files from public/ (your React app)
 * - Proxies /api/* requests to the LIVE Cloudflare Worker
 * - esbuild watches for source changes and rebuilds bundle.js automatically
 *
 * Usage: npm run dev
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ── Config ──────────────────────────────────────────────────
// Defaults to the dashboard worker, fallback to ingest worker
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://jkbms-dashboard.vcode-fiverr.workers.dev';
const INGEST_URL = 'https://jkbms-cloud.vcode-fiverr.workers.dev';
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');
const PORT = 3000;

let activeWorkerUrl = DASHBOARD_URL;

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
function proxyRequest(targetUrl, req, res, onError) {
  const target = new URL(req.url, targetUrl);
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
    // If dashboard worker gives 404 or 502 (e.g. not deployed yet), allow fallback
    if ((upstream.statusCode === 404 || upstream.statusCode === 502) && onError) {
      onError();
      return;
    }
    const h = { ...upstream.headers };
    h['access-control-allow-origin'] = '*';
    res.writeHead(upstream.statusCode, h);
    upstream.pipe(res);
  });

  proxy.on('error', (err) => {
    if (onError) {
      onError(err);
    } else {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
    }
  });

  req.pipe(proxy);
}

// ── 2) Local HTTP server with smart proxy ───────────────────
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    // Try primary worker, fallback to ingest worker if needed
    proxyRequest(activeWorkerUrl, req, res, () => {
      if (activeWorkerUrl !== INGEST_URL) {
        activeWorkerUrl = INGEST_URL;
        proxyRequest(INGEST_URL, req, res, (err) => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err ? err.message : 'Upstream unavailable' }));
        });
      } else {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Upstream unavailable' }));
      }
    });
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

server.listen(PORT, () => {
  console.log('');
  console.log(`\x1b[33m⚡ JK-BMS Dev Server\x1b[0m`);
  console.log(`\x1b[33m   App:        http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[33m   API Proxy:  ${activeWorkerUrl}\x1b[0m`);
  console.log(`\x1b[33m   Fallback:   ${INGEST_URL}\x1b[0m`);
  console.log('');
  console.log('   Edit files in frontend/src/ — bundle rebuilds automatically.');
  console.log('   Refresh browser to see changes.\n');
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
