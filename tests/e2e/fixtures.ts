import { test as base } from "@playwright/test";
import { Pool } from "pg";

export const test = base.extend<{ authRateLimitIsolation: void }>({
  authRateLimitIsolation: [
    async ({ baseURL }, runTest) => {
      const testUrl = process.env.TEST_DATABASE_URL;
      if (
        baseURL !== "http://127.0.0.1:3100" ||
        !testUrl ||
        new URL(testUrl).pathname !== "/vulnvault_test" ||
        testUrl === process.env.DATABASE_URL
      ) {
        throw new Error(
          "Browser auth isolation requires the separate test app and database.",
        );
      }
      const pool = new Pool({ connectionString: testUrl });
      try {
        // A shared local throttle is intentional. Isolate tests by clearing its
        // disposable database buckets, while keeping throttling active within each test.
        await pool.query(
          "DELETE FROM rate_limit WHERE key NOT LIKE 'workspace-create:%'",
        );
        await runTest();
      } finally {
        await pool.end();
      }
    },
    { auto: true },
  ],
});
