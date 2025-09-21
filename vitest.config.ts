import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['src/disabled/**/*'],
    testTimeout: 30000,
    setupFiles: ['./src/test/setup.ts']
  }
})