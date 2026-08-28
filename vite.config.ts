import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true }, // listen on LAN, not just localhost — required for QR sideload
  build: { outDir: 'dist', target: 'es2020' },
});
