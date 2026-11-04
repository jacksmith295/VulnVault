import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL is required. Tests never use DATABASE_URL as a fallback.");

const testDatabase = new URL(testUrl);
if (!testDatabase.pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must name a dedicated database ending in _test.");
}
const developmentDatabase = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : undefined;
if (developmentDatabase && testDatabase.hostname === developmentDatabase.hostname
  && (testDatabase.port || "5432") === (developmentDatabase.port || "5432")
  && testDatabase.pathname === developmentDatabase.pathname) {
  throw new Error("Test and development database URLs must differ.");
}

process.env.DATABASE_URL = testUrl;
process.env.BETTER_AUTH_SECRET = "vulnvault-integration-test-secret-only-32chars";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
