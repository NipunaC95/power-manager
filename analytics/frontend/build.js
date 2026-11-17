const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Ensure output directory exists
const publicDir = path.resolve(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Copy index.html to public
fs.copyFileSync(
  path.resolve(__dirname, 'index.html'),
  path.resolve(publicDir, 'index.html')
);

// Copy icons if present
['apple-touch-icon.png', 'favicon.png', 'icon-192.png'].forEach((f) => {
  const src = path.resolve(__dirname, '../../public', f);
  const dst = path.resolve(publicDir, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
  }
});

esbuild.build({
  entryPoints: [path.resolve(__dirname, 'src/main.tsx')],
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['chrome90', 'firefox90', 'safari14'],
  outfile: path.resolve(publicDir, 'bundle.js'),
}).then(() => {
  console.log('✅ Analytics frontend bundle created in analytics/public/');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

