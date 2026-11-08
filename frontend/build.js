const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['chrome90', 'firefox90', 'safari13'],
  outfile: '../public/bundle.js',
}).catch(() => process.exit(1));
