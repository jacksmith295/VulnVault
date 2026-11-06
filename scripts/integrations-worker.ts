import { config } from "dotenv";
import { parseArgs } from "node:util";
import { setTimeout } from "node:timers/promises";

config({ path: [".env.local", ".env"], quiet: true });

const stop = new AbortController();
process.once("SIGINT", () => stop.abort());
process.once("SIGTERM", () => stop.abort());

async function main() {
  const { values } = parseArgs({
    options: {
      once: { type: "boolean", default: false },
      workspace: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  const { readGithubConfig } =
    await import("../src/features/integrations/config");
  if (!readGithubConfig()) throw new Error("not_configured");
  const { runNextSync } = await import("../src/features/integrations/sync");
  do {
    const result = await runNextSync(values.workspace);
    if (result) {
      // Status and counts are enough for operations; vulnerability evidence stays in the app.
      console.log(
        `Repository sync: ${result.status}; imported ${result.imported ?? 0}.`,
      );
      if (result.status !== "success") {
        if (values.once) process.exitCode = 1;
        else await setTimeout(10_000, undefined, { signal: stop.signal });
      }
      if (values.once && result.status !== "success") break;
      continue;
    }
    if (values.once) break;
    await setTimeout(10_000, undefined, { signal: stop.signal });
  } while (!stop.signal.aborted);
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
