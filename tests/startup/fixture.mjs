import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const secret = "synthetic-startup-secret-do-not-print";

export async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "vulnvault-startup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (file, value) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), value);
  };
  await write(".env.local", `DATABASE_URL=postgresql://vulnvault:vulnvault@localhost:5432/vulnvault\nBETTER_AUTH_SECRET=${secret}\n`);
  await write(".env.lan", "LAN_IP=192.168.1.146\n");
  await write(".env.tailscale", "TAILSCALE_DNS_NAME=vulnvault.example.ts.net\n");
  for (const file of ["compose.yaml", "compose.lan.yaml", "compose.tailscale.yaml"]) await write(file, "services: {}\n");
  return { root, write };
}

export function container(root, service, options = {}) {
  return {
    Id: `${service}-id`,
    Image: `sha256:${service}-image`,
    Name: `/existing-${service}-1`,
    Config: { Labels: {
      "com.docker.compose.project": "existing",
      "com.docker.compose.service": service,
      "com.docker.compose.project.working_dir": root,
      "com.docker.compose.project.config_files": `${root}/compose.yaml,${root}/compose.lan.yaml`,
    } },
    State: { Running: true, Status: "running", Health: { Status: "healthy" } },
    HostConfig: { NetworkMode: "existing_default" },
    NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "5432" }] } },
    Mounts: service === "db" ? [{ Type: "volume", Name: "existing_postgres_data", Destination: "/var/lib/postgresql/data" }] : [],
    ...options,
  };
}
