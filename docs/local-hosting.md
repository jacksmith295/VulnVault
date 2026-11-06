# PC-local hosting and phone access

These optional modes run a production build on your PC, using the existing local PostgreSQL and Mailpit. Normal development still runs Next.js on the host. Choose trusted Wi-Fi HTTP or private Tailscale HTTPS; use only one app overlay at a time. Neither mode enables public hosting or cloud deployment. Run all commands from the repository root.

## Preserve the existing Compose project and data

Compose scopes containers and named volumes to a project name. Reuse the project that owns your existing database. A different checkout directory can select a different default project and create an empty database and a new Tailscale identity. Before running the commands below, inspect project labels without printing container configuration or secrets:

```sh
docker ps -a --filter label=com.docker.compose.service=db --format '{{.Names}}	{{.Label "com.docker.compose.project"}}'
```

Identify the database for this installation, then replace the example with its exact project label:

```sh
export VULNVAULT_COMPOSE_PROJECT=your-existing-project-name
```

The commands below pass this value explicitly with `-p`, including when running from another checkout. Keep using the same value when managing host infrastructure, and run host migration commands with the existing database URL. If there is no existing installation, choose a project name once and use it consistently for local setup and hosting. Do not guess a different name to work around a startup error.

The existing `postgres_data` named volume holds application data. The `tailscale_state` volume holds the private device identity and certificate state. Their full Docker names include the project name, for example `vulnvault_postgres_data`. Never use `down -v` for routine stopping, and do not remove either volume to resolve connectivity problems. These procedures do not migrate data between projects or checkouts.

## Runtime configuration

The Docker build enables standalone output with the build-only `VULNVAULT_STANDALONE=1` flag. Normal host builds and `npm run start` keep their existing Next.js output; no runtime flag is needed in the container.

The image contains application code and build-only placeholder configuration. Real settings enter the running container from `.env.local`; environment files are excluded from the image. Both hosting overlays explicitly override `DATABASE_URL` with `postgresql://vulnvault:vulnvault@db:5432/vulnvault`, overriding the value from `.env.local`. They set SMTP to the internal `mailpit:1025` address and set the authentication URL for the chosen mode. These settings support only the default Compose database credentials. If your existing database uses custom credentials, create an ignored local Compose override that sets the app's `DATABASE_URL` to those credentials at the internal `db:5432` address, then include that file last with `-f` in every app command below. Do not change existing database credentials or volumes to fit the example, and never commit the override. Startup does not apply migrations or reset data.

Keep the existing authentication secret in `.env.local` when switching modes. The overlay sets `BETTER_AUTH_URL` to the chosen address; use that exact origin for application login and email links.

## Phone access over local Wi-Fi

The optional Docker setup runs a production build on your PC and reuses the existing Compose database and Mailpit. The [normal host development commands](../README.md#local-setup) remain available. Your PC must stay on and your phone must use the same trusted local network. This setup uses HTTP; it is intended for trusted Wi-Fi only. Do not forward this port through your router.

Complete [local setup](../README.md#local-setup) and apply the existing migrations first. Keep `.env.local` with your existing database credentials and authentication secret. Create an ignored `.env.lan` file containing your PC's Wi-Fi IPv4 address, for example:

```dotenv
LAN_IP=192.168.1.146
```

Find the address with `ip -brief address` on Linux. Start the app from the repository root:

```sh
docker compose -p "$VULNVAULT_COMPOSE_PROJECT" --env-file .env.lan -f compose.yaml -f compose.lan.yaml up -d --build --wait app
```

Open `http://192.168.1.146:3001` on your phone, substituting your configured address. Use this same address on your PC when testing the Docker app, because authentication accepts that origin and generates email links for it. Existing accounts and workspace data remain available. Sessions are scoped to the new address, so sign in again. PostgreSQL and Mailpit stay bound to PC loopback addresses. Read verification and password reset messages at `http://localhost:8025` on your PC and open their links on your phone if needed.

After source changes, repeat the start command to rebuild. Stop only the Docker app with:

```sh
docker compose -p "$VULNVAULT_COMPOSE_PROJECT" --env-file .env.lan -f compose.yaml -f compose.lan.yaml stop app
```

The app restarts automatically with Docker unless explicitly stopped. If DHCP changes your PC's address, update `.env.lan`, repeat the start command, and use the new URL. Reserving the PC's address in your router avoids this. If the phone cannot connect, confirm that both devices use the same Wi-Fi, that Wi-Fi client isolation is off, and that the PC firewall permits TCP port 3001 from your local subnet. Do not expose the database or development inbox to fix connectivity.

This optional container runs the web app only. Scheduled integration polling still uses the [documented host worker](../README.md#github-dependabot-integration) with its host configuration and key path. GitHub integration is disabled in the container because host private-key paths are unavailable there. Enabling container-based sync later needs a separately agreed read-only key mount and overrides for both GitHub App environment variables. No private keys are copied into the image.

## Remote access with Tailscale

This optional mode keeps VulnVault on your PC and makes it reachable through a private Tailscale HTTPS address. Install [Tailscale on your phone](https://tailscale.com/download) and use the same account for your phone and the container. The PC must remain awake and online. No router port forwarding is needed. Application login, permissions, and rate limits remain active.

Use `compose.yaml` with `compose.tailscale.yaml`, without `compose.lan.yaml`. These are alternative modes for the same app container. The Wi-Fi mode can stay running during Tailscale sign-in. Switching the app to remote mode removes its published Wi-Fi port; use the private HTTPS address on both local Wi-Fi and mobile data with Tailscale connected.

Start just Tailscale for initial sign-in:

```sh
TAILSCALE_DNS_NAME=bootstrap.invalid docker compose -p "$VULNVAULT_COMPOSE_PROJECT" -f compose.yaml -f compose.tailscale.yaml up -d --no-deps tailscale
TAILSCALE_DNS_NAME=bootstrap.invalid docker compose -p "$VULNVAULT_COMPOSE_PROJECT" -f compose.yaml -f compose.tailscale.yaml logs --tail 100 tailscale
```

Open the `https://login.tailscale.com/a/...` link shown in the logs and connect the device named `vulnvault`. Do not publish these logs or the sign-in link. No reusable authentication key is required. The temporary hostname above only lets Compose parse the app definition while starting Tailscale; do not use it to start the app. Sign-in has a ten-minute startup window. If it expires, restart the Tailscale container and use its latest link.

After sign-in, obtain the actual DNS name without exposing the rest of the device status, and save it to the ignored `.env.tailscale` file:

```sh
TAILSCALE_DNS_NAME=bootstrap.invalid docker compose -p "$VULNVAULT_COMPOSE_PROJECT" -f compose.yaml -f compose.tailscale.yaml exec -T tailscale tailscale status --json | node -e 'let input=""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => { const status=JSON.parse(input); const name=status.Self?.DNSName?.replace(/\.$/, ""); if (status.BackendState !== "Running" || !name?.endsWith(".ts.net")) process.exit(1); require("node:fs").writeFileSync(".env.tailscale", "TAILSCALE_DNS_NAME=" + name + "\n"); console.log("https://" + name); });'
```

Use the exact returned name, which may include an automatically assigned suffix. Enable MagicDNS and HTTPS certificates in the [Tailscale DNS settings](https://login.tailscale.com/admin/dns) if they are not already enabled. Enabling HTTPS permits certificate issuance; certificate hostnames are recorded in public certificate transparency logs, while application access stays private. The committed Serve configuration terminates HTTPS on port 443 and forwards to the app. It leaves Funnel disabled.

Before switching a shared Tailscale network, review its access policy. Default permissive policies let other members of that network reach the service. For a network containing only your own devices, that means your devices. In a shared network, restrict access to your account and destination port 443 using the network's grants or ACLs. Rules are additive, so an existing allow-all rule must also be addressed. Do not replace an existing policy without checking its other services.

The app and Tailscale share a container network namespace. Tailscale userspace networking can also forward permitted traffic to other listening local ports, including app HTTP port 3000 and the health endpoint on port 9002. Traffic still traverses the encrypted Tailscale connection. Restricting the network policy to port 443 prevents those alternate paths. There are no Docker-published ports for either container in remote mode; PostgreSQL and Mailpit retain their host loopback bindings.

Once the device is connected, DNS and HTTPS are enabled, and the access policy matches your intended users, switch the app:

```sh
docker compose -p "$VULNVAULT_COMPOSE_PROJECT" --env-file .env.tailscale -f compose.yaml -f compose.tailscale.yaml up -d --build --wait app
docker compose -p "$VULNVAULT_COMPOSE_PROJECT" --env-file .env.tailscale -f compose.yaml -f compose.tailscale.yaml exec tailscale tailscale serve status
```

On your phone, enable Tailscale, open the printed HTTPS address, and sign into VulnVault again. If your phone has mobile data, turn Wi-Fi off to check access over mobile data. Otherwise, repeat the check from a different Wi-Fi network while leaving Tailscale enabled. Then disable Tailscale and confirm the address stops working, using a fresh browser request rather than an already loaded page. A healthy Tailscale container only proves it has a private network address; verify HTTPS and application login separately. Verification and password reset links use the HTTPS origin. The development inbox remains accessible only on your PC at `http://localhost:8025`; these emails are not delivered to real inboxes.

After application changes, repeat the app start command to rebuild it. The Tailscale image is pinned to a tested stable digest. When deliberately updating that image or recreating its container, recreate both containers so the app joins the current network namespace:

```sh
docker compose -p "$VULNVAULT_COMPOSE_PROJECT" --env-file .env.tailscale -f compose.yaml -f compose.tailscale.yaml up -d --build --wait --force-recreate --no-deps tailscale app
```

The `tailscale_state` named volume retains the device identity and certificate state across restarts. Treat it as credentials. Do not remove it or use `down -v` to stop the service. Device-key expiry or revocation can require signing in again; check the device in the Tailscale admin console if remote access stops. Stop the app and remote access without deleting data:

```sh
docker compose -p "$VULNVAULT_COMPOSE_PROJECT" --env-file .env.tailscale -f compose.yaml -f compose.tailscale.yaml stop app tailscale
```

To return to Wi-Fi mode, run its documented start command with `.env.lan` and `compose.lan.yaml`. Existing accounts and database data are shared between the two modes. Remote mode uses the same production image and disabled GitHub integration as Wi-Fi mode; it does not enable hot reloading, add a worker, change the schema, or trust forwarded IP headers.

See the [Tailscale Docker parameters](https://tailscale.com/docs/features/containers/docker/docker-params) and [Serve documentation](https://tailscale.com/docs/reference/tailscale-cli/serve) for the underlying configuration.
