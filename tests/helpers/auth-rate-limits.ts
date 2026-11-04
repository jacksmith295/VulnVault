import { notLike } from "drizzle-orm";
import { db } from "@/db";
import { rateLimit } from "@/db/schema";

// Suites run sequentially against the disposable test database. Clear only auth
// buckets between tests; workspace creation counters belong to their own tests.
export async function resetAuthRateLimits() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (
    !testUrl ||
    process.env.DATABASE_URL !== testUrl ||
    !new URL(testUrl).pathname.endsWith("_test")
  ) {
    throw new Error(
      "Auth rate-limit cleanup requires the isolated test database.",
    );
  }
  await db
    .delete(rateLimit)
    .where(notLike(rateLimit.key, "workspace-create:%"));
}
