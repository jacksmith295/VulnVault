import { config } from "dotenv";
import { parseArgs } from "node:util";

config({ path: [".env.local", ".env"], quiet: true });

const stop = new AbortController();
process.once("SIGINT", () => stop.abort());
process.once("SIGTERM", () => stop.abort());

async function main() {
  const { values } = parseArgs({
    options: {
      once: { type: "boolean", default: false },
      check: { type: "boolean", default: false },
      workspace: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  const { readGithubConfig } =
    await import("../src/features/integrations/config");
  if (!readGithubConfig()) throw new Error("not_configured");
  if (values.check) {
    const { pool } = await import("../src/lib/server/database");
    await pool.query("SELECT 1");
    return;
  }
  const { runNextSync } = await import("../src/features/integrations/sync");
  const { runIntegrationWorker } =
    await import("../src/features/integrations/worker");
  process.exitCode = await runIntegrationWorker({
    runNextSync,
    workspace: values.workspace,
    once: values.once,
    signal: stop.signal,
  });
}

async function run() {
  try {
    await main();
  } catch {
    if (!stop.signal.aborted) {
      console.error(
        "Integration worker could not complete. Check GitHub App configuration and PostgreSQL; safe sync status is available in the workspace.",
      );
      process.exitCode = 1;
    }
  } finally {
    try {
      const { pool, authThrottlePool } =
        await import("../src/lib/server/database");
      await Promise.all([pool.end(), authThrottlePool.end()]);
    } catch {
      console.error(
        "Integration worker could not close its database connection.",
      );
      process.exitCode = 1;
    }
  }
}

void run();
