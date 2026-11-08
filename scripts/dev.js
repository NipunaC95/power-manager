/**
 * Dev server script — runs esbuild watch + wrangler dev --remote concurrently.
 * esbuild rebuilds the React app on every file change.
 * wrangler dev serves the worker API + static assets, using the REMOTE D1 database for live data.
 */
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');

// 1) Start esbuild in watch mode (rebuilds on save)
const esbuild = spawn(
  'npx', [
    'esbuild',
    'src/main.jsx',
    '--bundle',
    '--outfile=../public/bundle.js',
    '--loader:.js=jsx',
    '--loader:.jsx=jsx',
    '--sourcemap',
    '--watch',
  ],
  { cwd: FRONTEND, stdio: 'pipe', shell: true }
);

esbuild.stdout.on('data', (d) => {
  const msg = d.toString().trim();
  if (msg) console.log(`\x1b[36m[build]\x1b[0m ${msg}`);
});
esbuild.stderr.on('data', (d) => {
  const msg = d.toString().trim();
  if (msg) console.log(`\x1b[36m[build]\x1b[0m ${msg}`);
});

// 2) Start wrangler dev with --remote to use the real D1 database
const wrangler = spawn(
  'wrangler', ['dev', '--remote'],
  { cwd: ROOT, stdio: 'pipe', shell: true }
);

wrangler.stdout.on('data', (d) => {
  const msg = d.toString().trim();
  if (msg) console.log(`\x1b[32m[worker]\x1b[0m ${msg}`);
});
wrangler.stderr.on('data', (d) => {
  const msg = d.toString().trim();
  if (msg) console.log(`\x1b[32m[worker]\x1b[0m ${msg}`);
});

// Clean up both processes on exit
const cleanup = () => {
  esbuild.kill();
  wrangler.kill();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

esbuild.on('close', (code) => {
  console.log(`\x1b[36m[build]\x1b[0m exited (${code})`);
  cleanup();
});

wrangler.on('close', (code) => {
  console.log(`\x1b[32m[worker]\x1b[0m exited (${code})`);
  cleanup();
});

