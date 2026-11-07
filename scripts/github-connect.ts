import { config } from "dotenv";
import { parseArgs } from "node:util";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { values } = parseArgs({
    options: { workspace: { type: "string" }, repository: { type: "string" } },
    strict: true,
    allowPositionals: false,
  });
  if (!values.workspace || !values.repository) {
    throw new Error("usage");
  }
  const { createGithubClient } =
    await import("../src/features/integrations/github");
  const { provisionGithubIntegration } =
    await import("../src/features/integrations/operator");
  const client = createGithubClient();
  const installation = await client.getInstallationForRepository(
    values.repository,
  );
  const repository = await client.getRepository(installation.id, {
    fullName: values.repository,
  });
  const result = await provisionGithubIntegration(
    values.workspace,
    installation,
    repository,
  );
  if ("error" in result) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }
  console.log(
    `GitHub installation connected. Repository mappings: ${result.mappedRepositories ?? 0}.`,
  );
  console.log(
    "Open a service's Integrations page to review repository scope and sync, or run the worker with --once --workspace <slug>.",
  );
}

async function run() {
  try {
    await main();
  } catch {
    console.error(
      "GitHub setup failed. Check App configuration, installation access, and database availability. Usage: npm run github:connect -- --workspace <slug> --repository <owner/repository>.",
    );
    process.exitCode = 1;
  } finally {
    try {
      const { pool, authThrottlePool } =
        await import("../src/lib/server/database");
      await Promise.all([pool.end(), authThrottlePool.end()]);
    } catch {
      console.error("GitHub setup could not close its database connection.");
      process.exitCode = 1;
    }
  }
}

void run();
