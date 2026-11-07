import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const script = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(script), "..");
class StartupError extends Error {}
const fail = (message) => {
  throw new StartupError(message);
};

export function run(command, args, options = {}) {
  return new Promise((done) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: [
        options.interactive ? "inherit" : "ignore",
        options.interactive ? "inherit" : "pipe",
        options.interactive ? "inherit" : "pipe",
      ],
    });
    let stdout = "",
      stderr = "";
    const timer = setTimeout(
      () => child.kill("SIGKILL"),
      options.timeout ?? 180_000,
    );
    child.stdout?.on("data", (data) => {
      if (stdout.length < 4_000_000) stdout += data;
    });
    child.stderr?.on("data", (data) => {
      if (stderr.length < 100_000) stderr += data;
    });
    child.on("error", () => {
      clearTimeout(timer);
      done({ code: 127, stdout: "", stderr: "" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function main(argv = [], deps = {}) {
  const root = deps.root ?? defaultRoot;
  const env = { ...(deps.env ?? process.env) };
  const disk = deps.fs ?? fs;
  const log = deps.log ?? console.log;
  const sleep =
    deps.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  const nodePath = deps.nodePath ?? process.execPath;
  const uid = deps.uid ?? process.getuid();
  const execute = deps.run ?? run;
  const call = (command, args, options = {}) =>
    execute(command, args, { cwd: root, env, ...options });
  const checked = async (command, args, message, options) => {
    const result = await call(command, args, options);
    if (result.code !== 0) fail(message);
    return result.stdout.trim();
  };
  const json = async (command, args, message) => {
    const output = await checked(command, args, message);
    try {
      return JSON.parse(output);
    } catch {
      fail(message);
    }
  };
  let stage = "validation";
  try {
    if (argv.some((arg) => arg !== "--build"))
      fail("Usage: npm run local:up -- [--build]");
    if (process.platform !== "linux")
      fail("Local startup currently requires Linux, flock and user systemd.");
    if (/[\x00-\x1f%$\\]/.test(root + nodePath))
      fail(
        "Local startup requires checkout and Node paths without control characters, percent, dollar or backslash characters.",
      );
    if (!/^24\./.test(deps.nodeVersion ?? process.versions.node))
      fail("Use Node.js 24 before running local startup.");
    await disk
      .access(resolve(root, ".env.local"))
      .catch(() =>
        fail("Existing .env.local is required. Complete local setup first."),
      );
    const context = await json(
      "docker",
      ["context", "inspect"],
      "Cannot inspect Docker context. Check Docker installation and access.",
    );
    const endpoint =
      (!env.DOCKER_CONTEXT && env.DOCKER_HOST) ||
      context[0]?.Endpoints?.docker?.Host;
    if (!endpoint?.startsWith("unix://"))
      fail(
        "Docker context is remote. Local startup only manages the existing PC installation.",
      );
    const info = await call("docker", [
      "info",
      "--format",
      "{{json .ServerVersion}}",
    ]);
    if (info.code !== 0) {
      if (
        /permission denied|access denied|operation not permitted/i.test(
          info.stderr,
        )
      )
        fail(
          "Docker socket access was denied. Fix user permissions before retrying; no privileged action was taken.",
        );
      if (
        !["unix:///var/run/docker.sock", "unix:///run/docker.sock"].includes(
          endpoint,
        )
      )
        fail(
          "Docker is unavailable for the selected context. Start it manually; remote and custom sockets are not managed.",
        );
      const state = await call("systemctl", ["is-active", "docker.service"]);
      if (state.stdout.trim() !== "inactive")
        fail(
          "Docker is unavailable. Check socket permissions or Docker service health; no privileged action was taken.",
        );
      log(
        "Starting the existing local Docker service (sudo may request your password).",
      );
      await checked(
        "sudo",
        ["systemctl", "start", "docker.service"],
        "Could not start the local Docker service.",
        { interactive: true },
      );
      let ready = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        if (
          (
            await call("docker", [
              "info",
              "--format",
              "{{json .ServerVersion}}",
            ])
          ).code === 0
        ) {
          ready = true;
          break;
        }
        await sleep(500);
      }
      if (!ready)
        fail(
          "Docker did not become available. Check service health and socket permissions.",
        );
    }
    const ids = (
      await checked(
        "docker",
        ["ps", "-aq", "--filter", "label=com.docker.compose.service=db"],
        "Cannot discover existing database containers.",
      )
    )
      .split(/\s+/)
      .filter(Boolean);
    if (!ids.length)
      fail(
        "No existing Compose database found. Complete local setup first; startup will not create a database installation.",
      );
    const databases = await json(
      "docker",
      ["inspect", ...ids],
      "Cannot inspect existing database labels.",
    );
    const requested = env.VULNVAULT_COMPOSE_PROJECT;
    const candidates = databases.filter((item) => {
      const labels = item.Config?.Labels ?? {};
      return requested
        ? labels["com.docker.compose.project"] === requested
        : labels["com.docker.compose.project.working_dir"] === root;
    });
    if (candidates.length !== 1)
      fail(
        "Database selection is ambiguous or belongs to another checkout. Set VULNVAULT_COMPOSE_PROJECT to the existing installation.",
      );
    const db = candidates[0];
    const labels = db.Config.Labels;
    const project = labels["com.docker.compose.project"];
    if (!project || !/^[a-z0-9][a-z0-9_-]*$/.test(project))
      fail("Existing Compose project label is invalid.");
    if (labels["com.docker.compose.project.working_dir"] !== root)
      fail(
        "Existing installation belongs to another checkout. Run local startup from its original checkout.",
      );
    const dataMount = db.Mounts?.find(
      (mount) =>
        mount.Type === "volume" &&
        mount.Destination === "/var/lib/postgresql/data",
    );
    if (!dataMount?.Name)
      fail("Existing database has no recognised postgres_data volume.");
    const volume = await json(
      "docker",
      ["volume", "inspect", dataMount.Name],
      "Existing database volume is missing; startup will not replace it.",
    );
    if (
      volume[0]?.Labels?.["com.docker.compose.volume"] !== "postgres_data" ||
      volume[0]?.Labels?.["com.docker.compose.project"] !== project
    )
      fail("Database volume ownership does not match this installation.");
    const serviceIds = (
      await checked(
        "docker",
        [
          "ps",
          "-aq",
          "--filter",
          `label=com.docker.compose.project=${project}`,
        ],
        "Cannot discover existing application containers.",
      )
    )
      .split(/\s+/)
      .filter(Boolean);
    const containers = await json(
      "docker",
      ["inspect", ...serviceIds],
      "Cannot inspect existing application containers.",
    );
    for (const name of ["db", "mailpit", "app", "tailscale"]) {
      const matches = containers.filter(
        (item) => item.Config?.Labels?.["com.docker.compose.service"] === name,
      );
      if (
        matches.length > 1 ||
        matches.some(
          (item) =>
            item.Config.Labels["com.docker.compose.project.working_dir"] !==
            root,
        )
      )
        fail(
          "Existing service containers are ambiguous or belong to another checkout. Inspect Compose labels before retrying.",
        );
    }
    const service = (name) =>
      containers.find(
        (item) => item.Config?.Labels?.["com.docker.compose.service"] === name,
      );
    const app = service("app");
    const originalFiles =
      app?.Config?.Labels?.["com.docker.compose.project.config_files"] ||
      service("tailscale")?.Config?.Labels?.[
        "com.docker.compose.project.config_files"
      ];
    const files = (env.VULNVAULT_COMPOSE_FILES || originalFiles || "")
      .split(",")
      .filter(Boolean);
    const inferred = files.includes(resolve(root, "compose.tailscale.yaml"))
      ? "tailscale"
      : files.includes(resolve(root, "compose.lan.yaml"))
        ? "lan"
        : undefined;
    const mode = env.VULNVAULT_LOCAL_MODE || inferred;
    if (!["lan", "tailscale"].includes(mode) || (inferred && inferred !== mode))
      fail(
        "Hosting mode is unknown or conflicts with the existing app. Set VULNVAULT_LOCAL_MODE=lan or tailscale for the existing installation.",
      );
    const baseFiles = [
      resolve(root, "compose.yaml"),
      resolve(root, `compose.${mode}.yaml`),
    ];
    if (!files.length) files.push(...baseFiles);
    if (
      !baseFiles.every((file, index) => files[index] === file) ||
      files.some(
        (file) =>
          !isAbsolute(file) ||
          !file.startsWith(`${root}/`) ||
          (file.endsWith("compose.lan.yaml") && mode !== "lan") ||
          (file.endsWith("compose.tailscale.yaml") && mode !== "tailscale"),
      )
    )
      fail(
        "Compose files must use this checkout’s base and matching overlay, followed by existing local overrides.",
      );
    for (const file of files)
      await disk
        .access(file)
        .catch(() =>
          fail(
            "A recorded Compose override is missing. Restore it or explicitly configure the complete original file list.",
          ),
        );
    const modeFile = resolve(root, `.env.${mode}`);
    await disk
      .access(modeFile)
      .catch(() =>
        fail(
          `Existing .env.${mode} is required. Complete hosting setup first.`,
        ),
      );
    const args = [
      "compose",
      "-p",
      project,
      "--env-file",
      modeFile,
      ...files.flatMap((file) => ["-f", file]),
    ];
    const configuration = await json(
      "docker",
      [...args, "config", "--format", "json"],
      "Compose configuration is invalid. Check hosting files and required settings.",
    );
    const configuredDbMount = configuration.services?.db?.volumes?.find(
      (mount) => mount.target === "/var/lib/postgresql/data",
    );
    if (
      configuration.volumes?.[configuredDbMount?.source]?.name !==
      dataMount.Name
    )
      fail(
        "Compose configuration would select a different database volume. Restore the existing overrides.",
      );
    const appConfig = configuration.services?.app;
    if (!appConfig) fail("Compose configuration has no app service.");
    if (app && !argv.includes("--build")) {
      const actualEnvironment = new Map(
        (app.Config.Env ?? []).map((entry) => {
          const separator = entry.indexOf("=");
          return [entry.slice(0, separator), entry.slice(separator + 1)];
        }),
      );
      const configurationChanged = Object.entries(
        appConfig.environment ?? {},
      ).some(
        ([key, value]) =>
          actualEnvironment.get(key) !==
          (value == null ? undefined : String(value)),
      );
      if (configurationChanged)
        fail(
          "Existing app settings differ from the current Compose configuration. Run npm run local:up -- --build to apply the changed settings explicitly.",
        );
    }
    const origin = appConfig.environment?.BETTER_AUTH_URL;
    if (
      typeof origin !== "string" ||
      (mode === "tailscale"
        ? !/^https:\/\/[a-z0-9.-]+\.ts\.net$/.test(origin)
        : !/^http:\/\/[0-9.]+:3001$/.test(origin))
    )
      fail("Hosting URL is invalid. Check the existing mode configuration.");
    const image = appConfig.image || `${project}-app`;
    if (
      !argv.includes("--build") &&
      (await call("docker", ["image", "inspect", image])).code !== 0
    )
      fail(
        "The existing app image is missing. Run npm run local:up -- --build to build it explicitly.",
      );
    const oldSidecar = service("tailscale");
    if (mode === "tailscale" && !oldSidecar) {
      const stateName = configuration.volumes?.tailscale_state?.name;
      if (!stateName)
        fail("Existing Tailscale identity volume is not configured.");
      const state = await json(
        "docker",
        ["volume", "inspect", stateName],
        "Existing Tailscale identity volume is missing. Complete Tailscale setup manually; startup never enrols a device.",
      );
      if (
        state[0]?.Labels?.["com.docker.compose.project"] !== project ||
        state[0]?.Labels?.["com.docker.compose.volume"] !== "tailscale_state"
      )
        fail(
          "Tailscale identity volume ownership does not match this installation.",
        );
    }
    stage = "database and inbox";
    log("Starting existing database, inbox and configured access services.");
    // Start existing containers without applying configuration changes to persistent services.
    for (const name of [
      "db",
      "mailpit",
      ...(mode === "tailscale" ? ["tailscale"] : []),
    ]) {
      const existing = service(name);
      if (existing && !existing.State?.Running)
        await checked(
          "docker",
          ["start", existing.Id],
          `Could not start existing ${name}.`,
        );
      else if (!existing)
        await checked(
          "docker",
          [
            ...args,
            "up",
            "-d",
            "--no-deps",
            "--no-build",
            "--pull",
            "never",
            "--wait",
            "--wait-timeout",
            "120",
            name,
          ],
          `Could not start ${name}. Check existing images and configuration.`,
        );
    }
    await checked(
      "docker",
      [
        ...args,
        "up",
        "-d",
        "--no-recreate",
        "--no-build",
        "--pull",
        "never",
        "--wait",
        "--wait-timeout",
        "120",
        "db",
        "mailpit",
        ...(mode === "tailscale" ? ["tailscale"] : []),
      ],
      "Existing infrastructure did not become healthy.",
    );
    stage = "application";
    if (argv.includes("--build")) {
      log("Building the app image. This may take several minutes.");
      await checked(
        "docker",
        [...args, "build", "--pull=false", "app"],
        "Application build failed. Existing services were preserved.",
        { timeout: 900_000 },
      );
    }
    log("Starting the app and waiting for health checks.");
    let repair = false;
    if (mode === "tailscale") {
      const currentId = await checked(
        "docker",
        [...args, "ps", "-q", "tailscale"],
        "Cannot identify running Tailscale sidecar.",
      );
      repair = Boolean(
        app && app.HostConfig?.NetworkMode !== `container:${currentId}`,
      );
      if (repair && !argv.includes("--build")) {
        const selectedImage = await json(
          "docker",
          ["image", "inspect", image],
          "Cannot verify the existing app image. Run with --build.",
        );
        if (selectedImage[0]?.Id !== app.Image)
          fail(
            "Existing app image differs from its configured tag. Run npm run local:up -- --build to replace it explicitly.",
          );
      }
      const status = await json(
        "docker",
        ["exec", currentId, "tailscale", "status", "--json"],
        "Tailscale identity is unavailable. Complete existing device sign-in manually.",
      );
      if (
        status.BackendState !== "Running" ||
        `https://${status.Self?.DNSName?.replace(/\.$/, "")}` !== origin
      )
        fail(
          "Tailscale is not connected with the configured identity. Check the existing device manually.",
        );
    }
    await checked(
      "docker",
      [
        ...args,
        "up",
        "-d",
        "--no-deps",
        "--no-build",
        "--pull",
        "never",
        "--wait",
        "--wait-timeout",
        "180",
        ...(repair || argv.includes("--build")
          ? ["--force-recreate"]
          : ["--no-recreate"]),
        "app",
      ],
      "Application did not become healthy. Existing database and identity were preserved.",
    );
    log(`Application: ${origin}`);
    const inboxId =
      service("mailpit")?.Id ||
      (await checked(
        "docker",
        [...args, "ps", "-q", "mailpit"],
        "Cannot identify the running inbox container.",
      ));
    const [runningInbox] = await json(
      "docker",
      ["inspect", inboxId],
      "Cannot inspect the running inbox port bindings.",
    );
    const inboxPorts = runningInbox?.NetworkSettings?.Ports?.["8025/tcp"] ?? [];
    const inboxPort =
      inboxPorts.find((port) => port.HostIp === "127.0.0.1") || inboxPorts[0];
    if (inboxPort && /^\d+$/.test(inboxPort.HostPort)) {
      const host = ["127.0.0.1", "0.0.0.0", "::", "::1"].includes(
        inboxPort.HostIp,
      )
        ? "localhost"
        : inboxPort.HostIp;
      log(
        `Mailpit (PC): http://${host.includes(":") ? `[${host}]` : host}:${inboxPort.HostPort}`,
      );
    } else {
      log("Mailpit (PC): not published.");
    }
    if (mode === "tailscale") {
      const host = await call("tailscale", ["status", "--json"]);
      let connected = false;
      try {
        connected =
          host.code === 0 && JSON.parse(host.stdout).BackendState === "Running";
      } catch {
        /* Safe fixed status below. */
      }
      log(
        connected
          ? "PC Tailscale client: connected."
          : "PC Tailscale client: URL not verified. Start and connect your existing host client manually.",
      );
    }
    stage = "integration worker";
    const settings = {};
    for (const name of [".env.local", ".env"]) {
      let content;
      try {
        content = await disk.readFile(resolve(root, name), "utf8");
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      for (const [key, value] of Object.entries(parse(content)))
        if (!(key in settings)) settings[key] = value;
    }
    const unit = `vulnvault-worker-${createHash("sha256").update(project).digest("hex").slice(0, 16)}.service`;
    if (!settings.GITHUB_APP_ID && !settings.GITHUB_APP_PRIVATE_KEY_FILE) {
      const previous = await call("systemctl", [
        "--user",
        "show",
        unit,
        "--property=ActiveState",
      ]);
      if (/ActiveState=(active|activating|reloading)/.test(previous.stdout))
        fail(
          `Existing worker remains active with cached configuration. Stop it using systemctl --user stop ${unit}, then retry.`,
        );
      if (
        previous.code !== 0 &&
        !previous.stdout.includes("LoadState=not-found")
      )
        fail(
          "Cannot verify the existing worker unit while GitHub configuration is absent. Check user systemd before retrying.",
        );
      log("Integration worker: not configured.");
      return 0;
    }
    const hostDb = new URL(settings.DATABASE_URL);
    const containerDb = new URL(appConfig.environment.DATABASE_URL);
    if (
      !["postgres:", "postgresql:"].includes(containerDb.protocol) ||
      containerDb.hostname !== "db" ||
      (containerDb.port || "5432") !== "5432"
    )
      fail(
        "Worker requires the app database to use the selected Compose db service on PostgreSQL port 5432. Restore the local database override before retrying.",
      );
    // Stopped containers can have no runtime port bindings until Docker starts them.
    const [runningDb] = await json(
      "docker",
      ["inspect", db.Id],
      "Cannot verify the running database port bindings for the worker.",
    );
    if (runningDb?.Id !== db.Id)
      fail("Cannot verify the selected running database for the worker.");
    const dbPorts = runningDb.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(hostDb.hostname) ||
      !dbPorts.some(
        (port) =>
          port.HostPort === (hostDb.port || "5432") &&
          ["127.0.0.1", "::1"].includes(port.HostIp),
      ) ||
      hostDb.pathname !== containerDb.pathname ||
      hostDb.username !== containerDb.username ||
      hostDb.password !== containerDb.password
    )
      fail(
        "Worker DATABASE_URL does not match the selected database’s loopback port and app credentials. Correct host configuration before starting the worker.",
      );
    const keys = new Set([
      ...Object.keys(settings),
      "GITHUB_APP_ID",
      "GITHUB_APP_PRIVATE_KEY_FILE",
      "DATABASE_URL",
      "BETTER_AUTH_URL",
      "BETTER_AUTH_SECRET",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_FROM",
      "NODE_ENV",
      "NODE_OPTIONS",
    ]);
    const workerEnv = { ...env };
    for (const key of keys) delete workerEnv[key];
    const workerArgs = [
      "--conditions=react-server",
      "--import",
      "tsx",
      resolve(root, "scripts/integrations-worker.ts"),
    ];
    log("Checking integration worker credentials and database connectivity.");
    await checked(
      nodePath,
      [...workerArgs, "--check"],
      "Integration worker preflight failed. Check file configuration, private key and selected PostgreSQL.",
      { env: workerEnv, timeout: 30_000 },
    );

    const show = await call("systemctl", [
      "--user",
      "show",
      unit,
      "--property=LoadState,ActiveState,SubState,WorkingDirectory,ExecStart,MainPID,Result,UnsetEnvironment",
    ]);
    const properties = Object.fromEntries(
      show.stdout
        .trim()
        .split("\n")
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
    if (show.code !== 0 && !show.stdout.includes("LoadState=not-found"))
      fail(
        "User systemd is unavailable. Start the worker manually after checking your user session.",
      );
    if (properties.LoadState && properties.LoadState !== "not-found") {
      if (
        properties.UnsetEnvironment &&
        [...keys].some(
          (key) => !properties.UnsetEnvironment.split(" ").includes(key),
        )
      )
        fail(
          "Existing worker unit uses older environment settings. Stop it manually and retry to load file configuration.",
        );
      if (
        properties.WorkingDirectory !== root ||
        !properties.ExecStart?.includes(nodePath) ||
        !properties.ExecStart?.includes(
          resolve(root, "scripts/integrations-worker.ts"),
        )
      )
        fail(
          "Existing worker unit belongs to another executable or checkout. Inspect it manually before proceeding.",
        );
    }
    const workerPid = Number(properties.MainPID || 0);
    for (const pid of await disk.readdir("/proc")) {
      if (!/^\d+$/.test(pid) || Number(pid) === workerPid) continue;
      try {
        if ((await disk.stat(`/proc/${pid}`)).uid !== uid) continue;
        const command = (
          await disk.readFile(`/proc/${pid}/cmdline`, "utf8")
        ).split("\0");
        if (
          command.some((part) => part.endsWith("/integrations-worker.ts")) &&
          !command.includes("--once") &&
          !command.includes("--check") &&
          (await disk.readlink(`/proc/${pid}/cwd`)) === root
        )
          fail(
            "A manual continuous integration worker is already running. Stop it yourself before using local startup.",
          );
      } catch (error) {
        if (error.message.startsWith("A manual")) throw error;
      }
    }
    if (
      properties.ActiveState === "active" &&
      properties.SubState === "running"
    ) {
      log(`Integration worker: already running (${unit}).`);
    } else {
      if (properties.LoadState && properties.LoadState !== "not-found")
        fail(
          `Existing worker unit is inactive or failed. Inspect journalctl --user -u ${unit}, then stop/reset the unit manually and retry.`,
        );
      await checked(
        "systemd-run",
        [
          "--user",
          "--collect",
          "--expand-environment=no",
          `--unit=${unit}`,
          "--property=Type=exec",
          "--property=Restart=on-failure",
          "--property=RestartSec=5s",
          `--property=WorkingDirectory=${root}`,
          `--property=UnsetEnvironment=${[...keys].join(" ")}`,
          "--",
          nodePath,
          ...workerArgs,
        ],
        "Could not start the user integration worker.",
        { env: workerEnv },
      );
      for (let attempt = 0; attempt < 5; attempt++) {
        await sleep(500);
        const state = await checked(
          "systemctl",
          [
            "--user",
            "show",
            unit,
            "--property=ActiveState,SubState,Result,NRestarts",
          ],
          "Cannot verify integration worker startup.",
        );
        if (
          /NRestarts=(?!0(?:\n|$))\d+/.test(state) ||
          !state.includes("ActiveState=active") ||
          !state.includes("SubState=running") ||
          (state.includes("Result=") && !state.includes("Result=success"))
        )
          fail(
            "Integration worker exited or failed during startup. Inspect its user journal.",
          );
      }
      log(`Integration worker: running (${unit}).`);
    }
    log(`Worker status: systemctl --user status ${unit}`);
    log(`Worker logs: journalctl --user -u ${unit}`);
    log(`Worker stop: systemctl --user stop ${unit}`);
    return 0;
  } catch (error) {
    // Provider and command output can contain credentials. Only our fixed messages are printed.
    const safe = error instanceof StartupError;
    log(
      `Local startup stopped during ${stage}. ${safe ? error.message : "Check local configuration and service health. No data was reset."}`,
    );
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  const args = process.argv.slice(2);
  if (process.env.VULNVAULT_STARTUP_LOCKED === script) {
    delete process.env.VULNVAULT_STARTUP_LOCKED;
    process.exitCode = await main(args);
  } else {
    // flock releases its kernel lock on every exit, including interruption or a crash.
    const lock = `/tmp/vulnvault-startup-${process.getuid()}.lock`;
    const child = spawn(
      "flock",
      [
        "--nonblock",
        "--conflict-exit-code",
        "75",
        lock,
        process.execPath,
        script,
        ...args,
      ],
      {
        stdio: "inherit",
        env: { ...process.env, VULNVAULT_STARTUP_LOCKED: script },
      },
    );
    child.on("error", () => {
      console.error("Local startup requires Linux flock.");
      process.exitCode = 1;
    });
    child.on("exit", (code) => {
      if (code === 75)
        console.error(
          "Another local startup is running. Wait for it to finish.",
        );
      process.exitCode = code ?? 1;
    });
  }
}
