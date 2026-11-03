import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const UI_URL = process.env.UI_URL ?? 'http://localhost:4200';
const API_URL = process.env.API_URL ?? 'http://localhost:8091';

/**
 * Two projects:
 *   api          - talks to the REST API on :8091 directly;
 *   ui-chromium  - drives the Angular application on :4200.
 *
 * baseURL always points at the local instance: neither the tests nor the traces
 * may reference the public practicesoftwaretesting.com stand.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 90_000,
  expect: { timeout: 15_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],

  outputDir: 'test-results',

  use: {
    testIdAttribute: 'data-test',
    // Traces are recorded for every test on purpose. The tests that reproduce
    // known defects are marked test.fail(), and Playwright treats an expected
    // failure as a passing run, so 'retain-on-failure' would drop exactly the
    // evidence that matters. Defect traces are copied to reports/traces/.
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'api',
      testMatch: /tests[\\/]api[\\/].*\.spec\.ts/,
      use: { baseURL: API_URL },
    },
    {
      name: 'ui-chromium',
      testMatch: /tests[\\/]ui[\\/].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: UI_URL },
    },
  ],
});
