const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['chrome90', 'firefox90', 'safari13'],
  outfile: 'dist/bundle.js',
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
}).catch(() => process.exit(1));

