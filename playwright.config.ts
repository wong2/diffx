import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:3433',
    headless: true,
    viewport: { width: 1400, height: 2200 },
  },
  webServer: {
    command: 'node dist/cli.mjs --no-open -p 3433',
    url: 'http://127.0.0.1:3433',
    reuseExistingServer: true,
    timeout: 60000,
  },
})
