/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: { globPatterns: ['**/*.{js,css,html,woff,woff2}'], navigateFallback: 'index.html' },
      manifest: {
        name: 'Japa Counter',
        short_name: 'Japa',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [],
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
  worker: { format: 'es' },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/harness/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20_000,
  },
});
