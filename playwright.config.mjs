// End-to-end checks of the built site on phone, tablet and desktop.
//   npm run test:e2e        (serves the repo root on :4173 while it runs)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'ignore',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'ipad', use: { ...devices['iPad Mini'] } },
    { name: 'ipad-landscape', use: { ...devices['iPad Mini landscape'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'desktop-wide', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
  ],
});
