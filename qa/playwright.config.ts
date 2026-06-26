import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "gallery.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "../playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    // Browser tests bypass the remaining CSP directives. The test hook removes
    // only upgrade-insecure-requests because WebKit applies it before bypassCSP
    // on the local HTTP server. Production CSP is covered by security workflows.
    bypassCSP: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1 --directory ..",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [
    {
      name: "iPhone 13 Safari",
      use: { ...devices["iPhone 13"] }
    },
    {
      name: "iPhone SE Safari",
      use: { ...devices["iPhone SE"] }
    },
    {
      name: "iPhone 14 Pro Max Safari",
      use: { ...devices["iPhone 14 Pro Max"] }
    },
    {
      name: "Pixel 5 Chrome",
      use: { ...devices["Pixel 5"] }
    }
  ]
});
