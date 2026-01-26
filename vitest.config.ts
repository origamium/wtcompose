import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'e2e/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    exclude: ['src/disabled/**/*', 'e2e/.test-workspace/**/*'],
    testTimeout: 60000, // Increased for e2e tests
    setupFiles: ['./src/test/setup.ts']
  }
})