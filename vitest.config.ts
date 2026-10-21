import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Only logic that does not need React Native (src/lib/*-rules.ts and the like) is tested here;
// screens are not.
export default defineConfig({
  // The app's tsconfig extends "expo/tsconfig.base", which esbuild cannot resolve; the tests need
  // nothing from it.
  esbuild: { tsconfigRaw: '{}' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
