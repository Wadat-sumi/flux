import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-worker',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4175', browserName: 'chromium', headless: true },
  webServer: {
    command: 'python3 -m http.server 4175 --bind 127.0.0.1 --directory .tools/worker-build',
    url: 'http://127.0.0.1:4175', reuseExistingServer: false, timeout: 10000,
  },
  reporter: [['list'], ['json', { outputFile: 'test-results/worker-results.json' }]],
});
