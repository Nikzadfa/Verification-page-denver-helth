import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the `@/*` path mapping in tsconfig.json so tests import the
      // same specifiers the application does.
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The engine suite is pure computation; a slow case means an accidental
    // loop in the planner rather than a legitimately expensive test.
    testTimeout: 20_000,
  },
});
