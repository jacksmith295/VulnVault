import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { main } from "../../scripts/local-up.mjs";
import { container, fixture, secret } from "./fixture.mjs";

const ok = (value = "") => ({ code: 0, stdout: typeof value === "string" ? value : JSON.stringify(value), stderr: "" });
const failed = (stderr = secret) => ({ code: 1, stdout: "", stderr });

async function scenario(t, { mode = "lan", handler, worker = false, proc = [] } = {}) {
  const f = await fixture(t);
  const calls = [], logs = [];
  const services = ["db", "mailpit", "app", ...(mode === "tailscale" ? ["tailscale"] : [])].map((name) => container(f.root, name));
  const app = services.find((item) => item.Id === "app-id");
  app.Config.Labels["com.docker.compose.project.config_files"] = `${f.root}/compose.yaml,${f.root}/compose.${mode}.yaml`;
  if (mode === "tailscale") app.HostConfig.NetworkMode = "container:tailscale-id";
  const config = {
    services: {
      db: { volumes: [{ source: "postgres_data", target: "/var/lib/postgresql/data" }] },
      app: { environment: { BETTER_AUTH_URL: mode === "lan" ? "http://192.168.1.146:3001" : "https://vulnvault.example.ts.net", DATABASE_URL: "postgresql://vulnvault:vulnvault@db:5432/vulnvault" } },
    },
    volumes: { postgres_data: { name: "existing_postgres_data" }, tailscale_state: { name: "existing_tailscale_state" } },
  };
  app.Config.Env = Object.entries(config.services.app.environment).map(([key, value]) => `${key}=${value}`);
  if (worker) await f.write(".env.local", `DATABASE_URL=postgresql://vulnvault:vulnvault@localhost:5432/vulnvault\nGITHUB_APP_ID=123\nGITHUB_APP_PRIVATE_KEY_FILE=/private/synthetic.pem\nBETTER_AUTH_SECRET=${secret}\n`);
  let unitStarted = false;
  const disk = { ...fs,
    readdir: async (file) => file === "/proc" ? proc.map((item) => String(item.pid)) : fs.readdir(file),
    stat: async (file) => file.startsWith("/proc/") ? { uid: 1000 } : fs.stat(file),
    readFile: async (file, ...args) => file.startsWith("/proc/") ? proc.find((item) => file.includes(`/${item.pid}/`)).command.join("\0") : fs.readFile(file, ...args),
    readlink: async (file) => file.startsWith("/proc/") ? f.root : fs.readlink(file),
  };
  const run = async (command, args, opts) => {
    calls.push({ command, args, options: opts });
    const override = await handler?.({ command, args, options: opts, services, config, root: f.root });
    if (override) return override;
    if (command === "docker") {
      if (args[0] === "info") return ok('"27.0"');
      if (args[0] === "context") return ok([{ Endpoints: { docker: { Host: "unix:///var/run/docker.sock" } } }]);
      if (args[0] === "ps") return ok(args.at(-1).endsWith("service=db") ? "db-id" : services.map((item) => item.Id).join("\n"));
      if (args[0] === "inspect") return ok(services.filter((item) => args.includes(item.Id)));
      if (args[0] === "volume") return ok([{ Labels: { "com.docker.compose.project": "existing", "com.docker.compose.volume": args.at(-1) === "existing_postgres_data" ? "postgres_data" : "tailscale_state" } }]);
      if (args[0] === "image") return ok([{ Id: "sha256:app-image" }]);
      if (args[0] === "start") return ok();
      if (args[0] === "exec") return ok({ BackendState: "Running", Self: { DNSName: "vulnvault.example.ts.net." } });
      if (args[0] === "compose") {
        if (args.includes("config")) return ok(config);
        if (args.includes("ps")) return ok("tailscale-id");
        if (args.includes("up") || args.includes("build")) return ok();
      }
    }
    if (command === "tailscale") return failed();
    if (command === "/opt/node24/bin/node") return ok();
    if (command === "systemd-run") { unitStarted = true; return ok(); }
    if (command === "systemctl" && args.includes("--user")) return ok(unitStarted ? "LoadState=loaded\nActiveState=active\nSubState=running\nResult=success\n" : "LoadState=not-found\n");
    throw new Error(`Unexpected mocked command: ${command} ${args.join(" ")}`);
  };
  const invoke = (argv = [], overrides = {}) => main(argv, { root: f.root, env: {}, run, log: (line) => logs.push(line), sleep: async () => {}, fs: disk, nodePath: "/opt/node24/bin/node", nodeVersion: "24.0.0", uid: 1000, ...overrides });
  return { ...f, services, config, calls, logs, invoke };
}

const mutations = (calls) => calls.filter(({ command, args }) => command === "sudo" || command === "systemd-run" || (command === "docker" && (args[0] === "start" || args.includes("up") || args.includes("build"))));
const appStart = (calls) => calls.find(({ args }) => args.includes("up") && args.at(-1) === "app");

test("reuses the existing project and volume without implicit build, pull, migration or sudo", async (t) => {
  const f = await scenario(t);
  const before = await fs.readFile(path.join(f.root, ".env.local"), "utf8");
  assert.equal(await f.invoke(), 0);
  assert.equal(await f.invoke(), 0);
  assert.equal(await fs.readFile(path.join(f.root, ".env.local"), "utf8"), before);
  assert.equal(f.calls.some(({ command, args }) => command === "sudo" || args.includes("build") || args.includes("down") || args.includes("db:migrate")), false);
  for (const { args } of f.calls.filter(({ args }) => args.includes("up"))) {
    assert.equal(args[args.indexOf("-p") + 1], "existing");
    assert.equal(args[args.indexOf("--pull") + 1], "never");
    assert.ok(args.includes("--wait"));
  }
  assert.match(f.logs.join("\n"), /Application: http:\/\/192.168.1.146:3001/);
  assert.match(f.logs.join("\n"), /worker: not configured/);
  assert.ok(appStart(f.calls).args.includes("--no-recreate"));
  assert.doesNotMatch(f.logs.join("\n"), new RegExp(secret));
});

test("builds only the app when explicitly requested", async (t) => {
  const f = await scenario(t);
  assert.equal(await f.invoke(["--build"]), 0);
  const builds = f.calls.filter(({ args }) => args.includes("build"));
  assert.equal(builds.length, 1);
  assert.equal(builds[0].args.at(-1), "app");
  assert.ok(builds[0].args.includes("--pull=false"));
  assert.ok(appStart(f.calls).args.includes("--force-recreate"));
});

for (const problem of ["missing", "ambiguous", "different volume"]) test(`rejects ${problem} database selection before mutations`, async (t) => {
  const f = await scenario(t, { handler: ({ command, args, services, config }) => {
    if (command !== "docker") return;
    if (problem === "missing" && args[0] === "ps") return ok("");
    if (problem === "ambiguous" && args[0] === "inspect") return ok([services[0], { ...services[0], Id: "other-db" }]);
    if (problem === "different volume" && args.includes("config")) return ok({ ...config, volumes: { postgres_data: { name: "new_empty_data" } } });
  } });
  assert.equal(await f.invoke(), 1);
  assert.deepEqual(mutations(f.calls), []);
});

test("preserves recorded local override files and uses them last", async (t) => {
  const f = await scenario(t);
  const override = path.join(f.root, "compose.private.yaml");
  await f.write("compose.private.yaml", `services:\n  app:\n    environment:\n      PRIVATE: ${secret}\n`);
  f.services.find((item) => item.Id === "app-id").Config.Labels["com.docker.compose.project.config_files"] += `,${override}`;
  assert.equal(await f.invoke(), 0);
  const args = appStart(f.calls).args;
  assert.equal(args[args.lastIndexOf("-f") + 1], override);
  assert.match(await fs.readFile(override, "utf8"), new RegExp(secret));
  assert.doesNotMatch(f.logs.join("\n"), new RegExp(secret));
});

for (const endpoint of ["unix:///var/run/docker.sock", "ssh://remote.example.test"]) test(`does not use sudo for unavailable Docker at ${endpoint}`, async (t) => {
  const f = await scenario(t, { handler: ({ command, args }) => {
    if (command === "docker" && args[0] === "info") return failed();
    if (command === "docker" && args[0] === "context") return ok([{ Endpoints: { docker: { Host: endpoint } } }]);
    if (command === "systemctl") return ok("active\n");
  } });
  assert.equal(await f.invoke(), 1);
  assert.deepEqual(mutations(f.calls), []);
  assert.doesNotMatch(f.logs.join("\n"), new RegExp(secret));
});

test("starts only an inactive standard local Docker daemon through sudo", async (t) => {
  let ready = false;
  const f = await scenario(t, { handler: ({ command, args }) => {
    if (command === "docker" && args[0] === "info") return ready ? ok('"27.0"') : failed();
    if (command === "systemctl") return ok("inactive\n");
    if (command === "sudo") { ready = true; return ok(); }
  } });
  assert.equal(await f.invoke(), 0);
  assert.deepEqual(f.calls.find(({ command }) => command === "sudo").args, ["systemctl", "start", "docker.service"]);
});

test("application health failure preserves infrastructure and suppresses command secrets", async (t) => {
  const f = await scenario(t, { handler: ({ args }) => args.includes("up") && args.at(-1) === "app" ? failed() : undefined });
  assert.equal(await f.invoke(), 1);
  assert.match(f.logs.join("\n"), /Application did not become healthy/);
  assert.doesNotMatch(f.logs.join("\n"), /Application:|synthetic-startup-secret/);
  assert.equal(f.calls.some(({ args }) => args.includes("down") || args.includes("rm")), false);
});

test("repairs a changed Tailscale namespace by recreating only the app and distinguishes PC connectivity", async (t) => {
  const f = await scenario(t, { mode: "tailscale" });
  f.services.find((item) => item.Id === "app-id").HostConfig.NetworkMode = "container:old-sidecar-id";
  assert.equal(await f.invoke(), 0);
  assert.ok(appStart(f.calls).args.includes("--force-recreate"));
  assert.equal(f.calls.filter(({ args }) => args.includes("--force-recreate")).length, 1);
  assert.match(f.logs.join("\n"), /Application: https:\/\/vulnvault.example.ts.net/);
  assert.match(f.logs.join("\n"), /PC Tailscale client: URL not verified/);
});

test("worker preflight failure neither starts a unit nor exposes credentials", async (t) => {
  const f = await scenario(t, { worker: true, handler: ({ command }) => command === "/opt/node24/bin/node" ? failed() : undefined });
  assert.equal(await f.invoke(), 1);
  assert.equal(f.calls.some(({ command }) => command === "systemd-run"), false);
  assert.doesNotMatch(f.logs.join("\n"), new RegExp(secret));
});

test("manual continuous worker is refused while one-shot workers are ignored", async (t) => {
  for (const once of [false, true]) {
    const f = await scenario(t, { worker: true, proc: [{ pid: 12345, command: ["node", "/any/integrations-worker.ts", ...(once ? ["--once"] : [])] }] });
    assert.equal(await f.invoke(), once ? 0 : 1);
    assert.equal(f.calls.some(({ command }) => command === "systemd-run"), once);
  }
});

test("an existing worker unit from another checkout is refused", async (t) => {
  const f = await scenario(t, { worker: true, handler: ({ command }) => command === "systemctl" ? ok("LoadState=loaded\nWorkingDirectory=/old/checkout\nExecStart=/old/node /old/checkout/scripts/integrations-worker.ts\nActiveState=active\nSubState=running\n") : undefined });
  assert.equal(await f.invoke(), 1);
  assert.equal(f.calls.some(({ command }) => command === "systemd-run"), false);
  assert.match(f.logs.join("\n"), /another executable or checkout/);
});

test("transient worker uses an absolute Node and cwd, with secrets absent from command and environment", async (t) => {
  const f = await scenario(t, { worker: true });
  assert.equal(await f.invoke([], { env: { BETTER_AUTH_SECRET: secret, GITHUB_APP_ID: secret, NODE_OPTIONS: secret, PATH: "/test/path" } }), 0);
  const launch = f.calls.find(({ command }) => command === "systemd-run");
  assert.ok(launch.args.includes(`--property=WorkingDirectory=${f.root}`));
  assert.equal(launch.args[launch.args.indexOf("--") + 1], "/opt/node24/bin/node");
  assert.ok(launch.args.includes("--expand-environment=no"));
  assert.doesNotMatch(launch.args.join(" "), new RegExp(secret));
  assert.equal(launch.options.env.BETTER_AUTH_SECRET, undefined);
  assert.equal(launch.options.env.GITHUB_APP_ID, undefined);
  assert.equal(launch.options.env.NODE_OPTIONS, undefined);
  assert.equal(launch.options.env.PATH, "/test/path");
});

test("a worker exiting immediately is not reported as running", async (t) => {
  let started = false;
  const f = await scenario(t, { worker: true, handler: ({ command }) => {
    if (command === "systemd-run") { started = true; return ok(); }
    if (command === "systemctl" && started) return ok("ActiveState=failed\nSubState=failed\nResult=exit-code\n");
  } });
  assert.equal(await f.invoke(), 1);
  assert.match(f.logs.join("\n"), /worker exited or failed/);
  assert.equal(f.logs.some((line) => /^Integration worker: running/.test(line)), false);
});

test("namespace repair refuses a changed app image unless a build is requested", async (t) => {
  const f = await scenario(t, { mode: "tailscale", handler: ({ args }) => args[0] === "image" ? ok([{ Id: "sha256:unrelated-image" }]) : undefined });
  f.services.find((item) => item.Id === "app-id").HostConfig.NetworkMode = "container:old-sidecar-id";
  assert.equal(await f.invoke(), 1);
  assert.equal(appStart(f.calls), undefined);
  assert.match(f.logs.join("\n"), /--build/);
});

test("missing app image fails before starting services and explains explicit build", async (t) => {
  const f = await scenario(t, { handler: ({ args }) => args[0] === "image" ? failed() : undefined });
  assert.equal(await f.invoke(), 1);
  assert.deepEqual(mutations(f.calls), []);
  assert.match(f.logs.join("\n"), /--build/);
});

test("missing recorded override fails before starting services", async (t) => {
  const f = await scenario(t);
  f.services.find((item) => item.Id === "app-id").Config.Labels["com.docker.compose.project.config_files"] += `,${f.root}/missing.private.yaml`;
  assert.equal(await f.invoke(), 1);
  assert.deepEqual(mutations(f.calls), []);
  assert.match(f.logs.join("\n"), /recorded Compose override is missing/);
});

test("CLI rejects a concurrent startup and releases its kernel lock after exit", { timeout: 5000 }, async (t) => {
  const f = await fixture(t);
  const lock = path.join(f.root, "startup.lock");
  const bin = path.join(f.root, "bin");
  await fs.mkdir(bin);
  // Redirect the CLI's fixed lock to a private test lock, using the real flock implementation.
  await f.write("bin/flock", `#!${process.execPath}\nimport { spawn } from 'node:child_process';\nconst args=process.argv.slice(2); args[3]=${JSON.stringify(lock)};\nconst child=spawn('/usr/bin/flock',args,{stdio:'inherit'}); child.on('exit',code=>process.exit(code ?? 1));\n`);
  await fs.chmod(path.join(bin, "flock"), 0o755);
  const holder = spawn("/usr/bin/flock", ["--no-fork", lock, process.execPath, "-e", "console.log('locked');setInterval(()=>{},1000)"], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => holder.kill());
  await once(holder.stdout, "data");
  const runCli = async () => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../scripts/local-up.mjs", import.meta.url)), "--invalid"], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    const [code] = await once(child, "exit");
    return { code, output };
  };
  const busy = await runCli();
  assert.equal(busy.code, 75);
  assert.match(busy.output, /Another local startup is running/);
  holder.kill();
  await once(holder, "exit");
  const released = await runCli();
  assert.equal(released.code, 1);
  assert.match(released.output, /Usage: npm run local:up/);
});

test("socket permission errors never trigger sudo even when the daemon is inactive", async (t) => {
  const f = await scenario(t, { handler: ({ command, args }) => {
    if (command === "docker" && args[0] === "info") return failed("permission denied while trying to connect to Docker");
    if (command === "systemctl") return ok("inactive\n");
  } });
  assert.equal(await f.invoke(), 1);
  assert.equal(f.calls.some(({ command }) => command === "sudo"), false);
});

test("worker configuration for a different database fails before executing its preflight", async (t) => {
  const f = await scenario(t, { worker: true });
  await f.write(".env.local", "DATABASE_URL=postgresql://vulnvault:vulnvault@localhost:9999/vulnvault\nGITHUB_APP_ID=123\nGITHUB_APP_PRIVATE_KEY_FILE=/private/synthetic.pem\n");
  assert.equal(await f.invoke(), 1);
  assert.equal(f.calls.some(({ command }) => command === "/opt/node24/bin/node" || command === "systemd-run"), false);
  assert.match(f.logs.join("\n"), /Worker DATABASE_URL does not match/);
});

test("an existing managed worker is reused on repeated startup", async (t) => {
  const f = await scenario(t, { worker: true, handler: ({ command, root }) => command === "systemctl" ? ok(`LoadState=loaded\nWorkingDirectory=${root}\nExecStart=/opt/node24/bin/node --conditions=react-server --import tsx ${root}/scripts/integrations-worker.ts\nActiveState=active\nSubState=running\nMainPID=123\n`) : undefined });
  assert.equal(await f.invoke(), 0);
  assert.equal(await f.invoke(), 0);
  assert.equal(f.calls.some(({ command }) => command === "systemd-run"), false);
  assert.equal(f.logs.filter((line) => /^Integration worker: already running/.test(line)).length, 2);
});

test("worker checks fresh database port bindings after stopped infrastructure becomes healthy", async (t) => {
  let healthy = false, refreshed = false;
  const f = await scenario(t, { worker: true, handler: ({ command, args, services }) => {
    if (command !== "docker") return;
    if (args.includes("up") && args.includes("db")) healthy = true;
    if (args[0] === "inspect" && args.length === 2 && args[1] === "db-id" && healthy) {
      refreshed = true;
      return ok([{ ...services[0], State: { Running: true, Status: "running", Health: { Status: "healthy" } }, NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "5432" }] } } }]);
    }
  } });
  f.services[0].State = { Running: false, Status: "exited" };
  f.services[0].NetworkSettings.Ports = {};
  assert.equal(await f.invoke(), 0);
  assert.equal(refreshed, true);
  assert.ok(f.calls.some(({ command }) => command === "systemd-run"));
});

test("removed GitHub file credentials require stopping an active cached worker", async (t) => {
  const f = await scenario(t, { handler: ({ command }) => command === "systemctl" ? ok("ActiveState=active\n") : undefined });
  assert.equal(await f.invoke(), 1);
  assert.match(f.logs.join("\n"), /worker remains active with cached configuration.*systemctl --user stop/);
  assert.equal(f.logs.some((line) => line === "Integration worker: not configured."), false);
  assert.equal(f.calls.some(({ command }) => command === "systemd-run"), false);
});

test("inbox URL uses the running container's actual custom published port", async (t) => {
  const f = await scenario(t, { handler: ({ command, args, services }) => command === "docker" && args[0] === "inspect" && args.length === 2 && args[1] === "mailpit-id" ? ok([{ ...services[1], NetworkSettings: { Ports: { "8025/tcp": [{ HostIp: "127.0.0.1", HostPort: "18025" }] } } }]) : undefined });
  assert.equal(await f.invoke(), 0);
  assert.ok(f.logs.includes("Mailpit (PC): http://localhost:18025"));
  assert.equal(f.logs.includes("Mailpit (PC): http://localhost:8025"), false);
});

for (const url of ["postgresql://vulnvault:vulnvault@remote.example.test:5432/vulnvault", "https://db:5432/vulnvault"]) test(`worker refuses app database outside local PostgreSQL: ${url}`, async (t) => {
  const f = await scenario(t, { worker: true });
  f.config.services.app.environment.DATABASE_URL = url;
  f.services.find((item) => item.Id === "app-id").Config.Env = Object.entries(f.config.services.app.environment).map(([key, value]) => `${key}=${value}`);
  assert.equal(await f.invoke(), 1);
  assert.match(f.logs.join("\n"), /app database to use the selected Compose db service/);
  assert.equal(f.calls.some(({ command }) => command === "/opt/node24/bin/node" || command === "systemd-run"), false);
});

test("unexpected command exceptions cannot masquerade as safe operator messages", async (t) => {
  const f = await scenario(t, { handler: () => { throw new Error(`Docker connection failed ${secret}`); } });
  assert.equal(await f.invoke(), 1);
  assert.doesNotMatch(f.logs.join("\n"), new RegExp(secret));
  assert.match(f.logs.join("\n"), /Check local configuration and service health/);
});

test("unsupported systemd path characters fail before commands or file changes", async (t) => {
  for (const character of ["$", "%", "\\"]) {
    const f = await scenario(t);
    const before = await fs.readFile(path.join(f.root, ".env.local"), "utf8");
    assert.equal(await f.invoke([], { nodePath: `/node${character}/bin/node` }), 1);
    assert.deepEqual(f.calls, []);
    assert.equal(await fs.readFile(path.join(f.root, ".env.local"), "utf8"), before);
  }
});

for (const [key, value] of [
  ["BETTER_AUTH_URL", "http://192.168.1.200:3001"],
  ["DATABASE_URL", "postgresql://vulnvault:changed@db:5432/vulnvault"],
  ["BETTER_AUTH_SECRET", secret],
]) test(`changed ${key} requires an explicit build before app configuration can change`, async (t) => {
  const f = await scenario(t);
  f.config.services.app.environment[key] = value;
  assert.equal(await f.invoke(), 1);
  assert.deepEqual(mutations(f.calls), []);
  assert.match(f.logs.join("\n"), /--build/);
  assert.doesNotMatch(f.logs.join("\n"), new RegExp(secret));
  assert.equal(await f.invoke(["--build"]), 0);
  assert.ok(appStart(f.calls).args.includes("--force-recreate"));
  assert.ok(f.calls.some(({ args }) => args.includes("build") && args.at(-1) === "app"));
});
