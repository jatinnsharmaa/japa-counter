/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  server: { port: 5173, strictPort: true },
  worker: { format: 'es' },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/harness/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
  },
});
