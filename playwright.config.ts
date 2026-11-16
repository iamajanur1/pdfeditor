import { defineConfig, devices } from '@playwright/test';
import { release } from 'node:os';

/**
 * Playwright 1.65+ does not provide its bundled Chromium/WebKit browsers for macOS 12.
 * On macOS 12, use a locally installed Google Chrome for BEST-EFFORT compatibility
 * checks only. The full supported-browser matrix always runs on Linux CI.
 *
 * macOS 12 (Monterey) corresponds to Darwin kernel major 21.
 */
const isMacOS12 = process.platform === 'darwin' && Number(release().split('.')[0]) === 21;

// Always exercise the actual distributable bundle, never a stale Vite dev server.
// A dedicated port also avoids accidentally testing another project's localhost.
const previewURL = 'http://127.0.0.1:4187';
const previewCommand = 'npm run preview -- --host 127.0.0.1 --port 4187 --strictPort';
const serverCommand = process.env.PAPRIFY_PREBUILT === '1'
  ? previewCommand
  : `npm run build && ${previewCommand}`;

const standardProjects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
];

// Playwright's `channel: 'chrome'` uses a system-installed Chrome rather than
// downloading an unsupported Playwright Chromium binary on macOS 12.
// These are NOT a substitute for the cross-browser CI release gate.
const legacyMacProjects = [
  {
    name: 'local-chrome-mac12',
    use: { ...devices['Desktop Chrome'], channel: 'chrome' as const },
  },
  {
    name: 'local-mobile-chrome-mac12',
    use: { ...devices['Pixel 7'], channel: 'chrome' as const },
  },
];

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  projects: isMacOS12 ? legacyMacProjects : standardProjects,
  use: { baseURL: previewURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: serverCommand,
    url: previewURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
