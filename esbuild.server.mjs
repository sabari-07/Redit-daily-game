import { build } from 'esbuild';

await build({
  entryPoints: ['src/server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/server/index.js',
  external: ['@devvit/web'],
  sourcemap: true,
});
