import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src/client',
  base: './',
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        splash: resolve(__dirname, 'src/client/splash.html'),
        game: resolve(__dirname, 'src/client/game.html'),
      },
    },
  },
  server: {
    proxy: {
      // Trailing slash matters: a bare '/api' prefix also matched the module request
      // '/api.ts' (src/client/api.ts) and returned a 500, leaving the page blank.
      '^/api/': 'http://localhost:3000',
      '^/internal/': 'http://localhost:3000',
    },
  },
});
