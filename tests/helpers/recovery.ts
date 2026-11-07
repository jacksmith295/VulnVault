import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { open, mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Every database touched here must be created by this invocation on the test cluster.
export async function recoverySandbox() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("Recovery requires TEST_DATABASE_URL.");
  const base = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(base.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) ||
    base.pathname !== "/vulnvault_test" ||
    decodeURIComponent(base.username) !== "vulnvault_test" ||
    value === process.env.DATABASE_URL || base.search || base.hash
  ) throw new Error("Recovery requires the isolated local vulnvault_test cluster and role.");
  const admin = new Pool({ connectionString: value });
  try {
    const identity = (await admin.query("SELECT current_database() AS database, current_user AS role, current_setting('server_version_num')::int / 10000 AS major")).rows[0];
    if (identity.database !== "vulnvault_test" || identity.role !== "vulnvault_test" || identity.major !== 17) {
      throw new Error("Recovery requires PostgreSQL 17 and the isolated test database role.");
    }
  } catch {
    await admin.end();
    throw new Error("Recovery could not validate the isolated PostgreSQL 17 test cluster.");
  }
  const databases = new Set<string>();
  const pools: Pool[] = [];
  const restored = new Set<string>();
  const directory = await mkdtemp(join(tmpdir(), "vulnvault-recovery-"));
  const identifier = (name: string) => {
    if (!/^recovery_[a-z0-9_]+_test$/u.test(name) || !databases.has(name)) {
      throw new Error("Refusing an untracked recovery database.");
    }
    return `"${name}"`;
  };
  return {
    directory,
    async database() {
      const name = `recovery_${randomUUID().replaceAll("-", "")}_test`;
      // CREATE has no IF NOT EXISTS: a collision must never reuse another database.
      await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
      databases.add(name);
      const url = new URL(base);
      url.pathname = `/${name}`;
      const pool = new Pool({ connectionString: url.href });
      pools.push(pool);
      return { name, url, pool };
    },
    async archive(source: URL, target: URL) {
      for (const url of [source, target]) {
        identifier(url.pathname.slice(1));
        const expected = new URL(base);
        expected.pathname = url.pathname;
        if (url.href !== expected.href) throw new Error("Recovery database connection mismatch.");
      }
      const targetName = target.pathname.slice(1);
      if (source.href === target.href || restored.has(targetName)) {
        throw new Error("Recovery must restore once into a different newly created database.");
      }
      const empty = new Pool({ connectionString: target.href });
      try {
        const existing = await empty.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' LIMIT 1");
        if (existing.rowCount) throw new Error("Recovery target must be empty.");
      } finally { await empty.end(); }
      restored.add(targetName);
      const archive = join(directory, `backup-${randomUUID()}.dump`);
      const output = await open(archive, "wx", 0o600);
      try {
        await pgTool("pg_dump", source, ["--format=custom", "--no-owner", "--no-privileges"], undefined, output.fd);
      } finally { await output.close(); }
      const input = await open(archive, "r");
      try {
        await pgTool("pg_restore", target, ["--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges"], input.fd);
      } finally { await input.close(); }
      return archive;
    },
    async close() {
      // A failed close or drop must not prevent cleanup of the other tracked
      // resources. Report only a generic failure, without raw database errors.
      let failed = false;
      try {
        const ended = await Promise.allSettled(pools.map(async (pool) => pool.end()));
        failed = ended.some((result) => result.status === "rejected");
        for (const name of databases) {
          try { await admin.query(`DROP DATABASE ${identifier(name)}`); }
          catch { failed = true; }
        }
      } finally {
        const cleaned = await Promise.allSettled([
          admin.end(),
          rm(directory, { recursive: true, force: true }),
        ]);
        failed ||= cleaned.some((result) => result.status === "rejected");
      }
      if (failed) throw new Error("Recovery cleanup could not release every temporary resource.");
    },
  };
}

async function pgTool(tool: string, url: URL, args: string[], input?: number, output?: number) {
  await new Promise<void>((resolve, reject) => {
    const containerName = `vulnvault-recovery-${randomUUID()}`;
    const child = spawn("docker", [
      "run", "--rm", "--name", containerName, "--network", "host", "-i", "--env", "PGPASSWORD",
      "postgres:17-alpine", tool,
      "--host", url.hostname.replaceAll(/[\[\]]/gu, ""), "--port", url.port || "5432",
      "--username", decodeURIComponent(url.username), "--dbname", url.pathname.slice(1), ...args,
    ], {
      env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
      stdio: [input ?? "ignore", output ?? "ignore", "pipe"],
    });
    // Drain without exposing database contents or credentials in failure output.
    child.stderr?.resume();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 30_000);
    child.once("error", () => { clearTimeout(timer); reject(new Error(`Recovery ${tool} could not start.`)); });
    child.once("exit", async (code) => {
      clearTimeout(timer);
      if (timedOut) {
        // Killing the Docker client does not guarantee the attached container
        // stops. Remove only the uniquely named client container created here.
        await new Promise<void>((done) => {
          const cleanup = spawn("docker", ["rm", "--force", containerName], { stdio: "ignore" });
          const deadline = setTimeout(() => cleanup.kill("SIGKILL"), 5_000);
          const finish = () => { clearTimeout(deadline); done(); };
          cleanup.once("error", finish);
          cleanup.once("exit", finish);
        });
      }
      if (code === 0 && !timedOut) resolve();
      else reject(new Error(`Recovery ${tool} failed. Check the isolated PostgreSQL 17 test cluster and Docker.`));
    });
  });
}

export async function migrateRecovery(pool: Pool, directory: string, through?: number) {
  let migrationsFolder = "drizzle";
  if (through !== undefined) {
    migrationsFolder = join(directory, `migrations-${through}`);
    await mkdir(join(migrationsFolder, "meta"), { recursive: true });
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= through);
    await writeFile(join(migrationsFolder, "meta/_journal.json"), JSON.stringify(journal));
    for (const entry of journal.entries) {
      await copyFile(`drizzle/${entry.tag}.sql`, join(migrationsFolder, `${entry.tag}.sql`));
    }
  }
  await migrate(drizzle(pool), { migrationsFolder });
}

export async function recoveredServer(databaseUrl: URL) {
  // Let the OS choose an unused loopback port. Require this child's readiness
  // signal as well as HTTP readiness so a port collision cannot pass the test.
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("No recovery port.");
  const port = address.port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: {
      ...process.env, DATABASE_URL: databaseUrl.href,
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: "recovery-test-only-secret-never-use-for-real-accounts-0123456789",
      GITHUB_APP_ID: "", GITHUB_APP_PRIVATE_KEY_FILE: "",
      SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025",
      SMTP_FROM: "VulnVault recovery tests <tests@vulnvault.local>",
      NEXT_TELEMETRY_DISABLED: "1",
    }, stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.resume();
  const stop = () => stopServer(child);
  try {
    await new Promise<void>((resolve, reject) => {
      let outputTail = "";
      const timer = setTimeout(() => reject(new Error("Recovery server readiness timed out.")), 25_000);
      const fail = () => { clearTimeout(timer); reject(new Error("Recovery server could not start.")); };
      child.once("error", fail);
      child.once("exit", fail);
      child.stdout.on("data", (chunk: Buffer) => {
        outputTail = (outputTail + chunk.toString()).slice(-1024);
        if (outputTail.includes("Ready in")) { clearTimeout(timer); resolve(); }
      });
    });
    const response = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok || child.exitCode !== null) throw new Error("Recovery server is unavailable.");
    return { origin, stop };
  } catch (error) { await stop(); throw error; }
}

async function stopServer(child: ChildProcess) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    child.kill("SIGTERM");
  });
}
