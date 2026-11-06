import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const testDatabase = process.env.TEST_DATABASE_URL;
if (
  !testDatabase ||
  new URL(testDatabase).pathname !== "/vulnvault_test" ||
  testDatabase === process.env.DATABASE_URL
) {
  throw new Error(
    "Set TEST_DATABASE_URL to the separate vulnvault_test database before browser tests.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "npm run db:migrate && npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: testDatabase,
      GITHUB_APP_ID: "",
      GITHUB_APP_PRIVATE_KEY_FILE: "",
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
      BETTER_AUTH_SECRET:
        "browser-test-only-secret-never-use-for-real-accounts-0123456789",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1025",
      SMTP_FROM: "VulnVault tests <tests@vulnvault.local>",
    },
  },
});
