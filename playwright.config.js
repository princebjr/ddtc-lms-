import { defineConfig, devices } from '@playwright/test';

// Device projects from docs/TESTING.md section 3. Every project runs in light and dark.
/** @type {Array<{ name: string, use: import('@playwright/test').PlaywrightTestOptions & Record<string, unknown> }>} */
const DEVICES = [
  { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
  { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 720 } } },
  { name: 'desktop-webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 720 } } },
  { name: 'laptop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  { name: 'full-hd-1920', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
  { name: 'iphone-se', use: { ...devices['iPhone SE'] } },
  { name: 'iphone-15', use: { ...devices['iPhone 15'] } },
  { name: 'android-small', use: { ...devices['Galaxy S5'], viewport: { width: 360, height: 640 } } },
  { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
  { name: 'ipad-portrait', use: { ...devices['iPad (gen 7)'] } },
  { name: 'ipad-landscape', use: { ...devices['iPad (gen 7) landscape'] } },
  { name: 'min-320', use: { ...devices['Galaxy S5'], viewport: { width: 320, height: 568 } } },
];

const projects = DEVICES.flatMap((d) =>
  /** @type {const} */ (['light', 'dark']).map((colorScheme) => ({
    name: `${d.name}-${colorScheme}`,
    use: { ...d.use, colorScheme },
  })),
);

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects,
  webServer: {
    command: `npm run build && npm run preview`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
