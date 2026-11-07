# Start the local installation

The startup command is implemented and merged. This command is for an existing Linux installation using Docker Compose and a user systemd session. Complete the [local hosting setup](local-hosting.md) first, including Tailscale sign-in or the LAN address. It does not provision a new installation.

From the installation's checkout, run:

```sh
npm run local:up
```

The command reuses the existing Compose project, PostgreSQL volume and Tailscale identity. It starts PostgreSQL and Mailpit, the selected app/Tailscale services, and the configured host integration worker. Health checks and bounded waits determine whether startup succeeded. It prints the app and local inbox addresses and reports PC Tailscale connectivity separately.

Node.js 24, installed dependencies, Docker Compose, Linux `flock`, and a working user systemd session are required. Startup discovers the database belonging to this checkout from Docker labels. Run it from the original installation checkout, including when using `npm --prefix /path/to/VulnVault run local:up` from another directory.

It infers LAN or Tailscale mode from the existing app or sidecar and retains its recorded custom Compose files. For an ambiguous project, set `VULNVAULT_COMPOSE_PROJECT` to its existing label. If the app and sidecar are missing, set `VULNVAULT_LOCAL_MODE=lan` or `tailscale`. `VULNVAULT_COMPOSE_FILES` can specify the complete comma-separated absolute file list: this checkout's `compose.yaml`, matching mode overlay, then existing custom overrides. Files outside the checkout are not supported by this command; use the manual hosting procedure for that setup.

## Startup and updates

Normal startup reuses the built app image. To build the current checkout and replace the app explicitly:

```sh
npm run local:up -- --build
```

If configured app settings differ from its existing container, normal startup stops before changing services. Use `--build` to apply reviewed configuration changes, including an updated LAN address, along with the current app code.

If an app must be recreated to join a replacement Tailscale sidecar, startup verifies that its configured image still matches the existing app image. A mismatch requires an explicit build. A missing image also requires `--build`.

Startup never pulls Git changes, installs packages, applies migrations, resets data, enrols a Tailscale device, changes tailnet policy or enables public access. Review migration requirements and use the [recovery guide](local-recovery.md) before upgrades that change the schema. A build failure leaves the running app available; a later startup failure reports the completed stages without tearing down existing services.

If the standard local Docker daemon is stopped, the command requests `sudo` to start it. Run the command as your normal user. Permission errors, remote Docker contexts and unsupported daemon setups produce instructions instead of switching contexts or running the whole application as root.

The host Tailscale client and the app's Docker sidecar are separate. Phone access uses the sidecar; your PC browser needs its own connected client for the private HTTPS address. Startup does not sign in either device or request sudo for the host Tailscale client. The LAN mode uses the configured Wi-Fi address on both devices.

## Integration worker

When GitHub App credentials are configured in the checkout's environment files, a read-only check validates the key and database connection before starting the existing host worker under user-level systemd supervision. The web container keeps GitHub sync disabled and receives no private key mount. Repository leases, retry policy and local triage behaviour are unchanged.

The worker uses an absolute Node.js 24 executable and this checkout as its working directory. Its configuration comes from `.env.local` with `.env` as a fallback; inherited shell/service settings for those keys are excluded. Secrets are loaded by the worker rather than placed in service command arguments. Keep its external private-key file and authentication settings as described in the [integration setup](../README.md#github-dependabot-integration).

Repeated startup reuses the managed worker. A conflicting service or detected manually started continuous worker must be resolved explicitly; startup does not kill it. The command prints the exact service name and commands for status, logs and stopping it. Supervision belongs to your logged-in user session. No lingering, login startup or boot service is enabled automatically.

`--build` rebuilds the web app only. After changing worker code, its Node executable or configured credentials, stop the printed worker unit and run startup again to load the changes. Removing credentials while a managed worker remains active is an explicit conflict, since that process can still hold its former credentials in memory.

## Failures and limits

- Ambiguous installations, unexpected checkout/configuration paths and missing existing volumes stop startup before a new installation is created. Custom Compose overrides must remain available.
- Unhealthy services, expired Tailscale sign-in and invalid worker configuration produce an actionable failure. Existing containers and volumes remain intact; never use `down -v` as a repair step.
- Container health and a connected Tailscale sidecar do not prove phone HTTPS or PC DNS access. Confirm the printed address in each browser. The inbox uses its actual published port, normally `http://localhost:8025` on the PC; it is reported as unavailable if no inbox port is published.
- Stopping the worker uses the printed user-systemd command. Stop the app/sidecar with the existing [hosting commands](local-hosting.md); database and identity volumes remain preserved.

See the upstream [Compose startup reference](https://docs.docker.com/reference/cli/docker/compose/up/) and [systemd-run reference](https://www.freedesktop.org/software/systemd/man/latest/systemd-run.html) for service behaviour.
