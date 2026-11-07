# VulnVault

VulnVault is a locally self-hosted vulnerability tracker for services and repositories. It supports verified accounts, workspaces, group-based service access, manual findings, Dependabot imports and a filterable triage board.

See [working agreements](AGENTS.md) and the [MVP roadmap](docs/mvp-plan.md) for current capabilities, priorities and technical references.

## Local setup

Requirements: Node.js 24 LTS, npm, Docker Engine and Docker Compose. Run commands from the repository root.

```sh
docker compose up -d --wait
npm ci
cp .env.example .env.local
openssl rand -hex 32
```

Replace `BETTER_AUTH_SECRET` in `.env.local` with the generated value. The example database and SMTP settings match Compose. Keep `BETTER_AUTH_URL=http://localhost:3000` and use that exact origin.

```sh
npm run db:migrate
npm run dev
```

Open [VulnVault](http://localhost:3000) and the [development inbox](http://localhost:8025). Register, open the verification email in Mailpit, follow its link, and log in. Verification and password-reset messages stay local; Mailpit does not deliver to real recipients.

Registration grants no workspace access. Create a workspace to become its owner. The header switches between accessible workspaces, and login remembers the last accessible choice in this browser. Workspace home is the findings board; Services and owner/admin Groups have separate pages. Invitations and member administration are not implemented.

Owners/admins manage services and access groups. Members can view permitted services and create/update their findings. No role can delete findings; archived-service findings remain readable but cannot change until an owner/admin restores the service. See the [access model](docs/service-access-groups-plan.md) and [finding lifecycle](docs/manual-findings-plan.md).

PostgreSQL is bound to `127.0.0.1:5432`, SMTP to `127.0.0.1:1025`, and Mailpit to `127.0.0.1:8025`. Compose credentials are development-only. Database data persists in the selected project's `postgres_data` volume, normally `vulnvault_postgres_data`. Use `docker compose stop` to stop infrastructure without removing data.

## PC-local hosting and phone access

The [hosting guide](docs/local-hosting.md) covers production Docker builds on your PC with trusted Wi-Fi HTTP or private Tailscale HTTPS. Keep the same Compose project to reuse the database and device identity. The PC must stay awake and online. Container GitHub sync is disabled; polling runs on the host.

For an existing Linux installation, [one-command startup](docs/local-startup.md) starts the selected stack and configured host worker:

```sh
npm run local:up
npm run local:up -- --build
```

The second command explicitly rebuilds the app. Startup never applies migrations, resets data or enrols Tailscale. Worker-code or credential changes require the manual worker restart described in that guide.

The [recovery runbook](docs/local-recovery.md) covers private backups and isolated restore, migration and login rehearsals. Synthetic tests do not establish recovery of an actual private archive or successful live cutover.

## Verification

Start the disposable test database:

```sh
docker compose --profile test up -d --wait
```

Set `TEST_DATABASE_URL` as shown in `.env.example`, then run:

```sh
npm run lint
npm run typecheck
npm run test:hooks
npm run test:startup
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The current Vitest setup requires the separate test database configuration even for pure unit tests. Persistence tests use PostgreSQL on port `55433` and manage their own fixtures/migrations. Browser tests migrate that database and start a separate production app at `127.0.0.1:3100`. Run persistence and browser suites sequentially. Browser tests require Mailpit and Playwright Chromium; install Playwright's system dependencies if your OS requires them.

Recovery browser tests also require the Docker CLI/daemon and the PostgreSQL 17 image for dump/restore tools. Their host networking targets Linux, including the Ubuntu CI runner. They use synthetic archives and temporary databases, not the owner's backup.

The test database has disposable temporary storage. Browser tests use unique email addresses without clearing the development inbox. Ignored browser artifacts may contain sensitive test data; do not publish them indiscriminately.

Hook tests use isolated Git fixtures. Startup tests use private fixtures and stubbed Docker/systemd commands, plus a real kernel-lock check. Neither suite requires a database or starts the app.

### Continuous integration

The [Verification workflow](.github/workflows/verification.yml) runs on PRs to `main`, pushes to `main` and manual dispatch. Its Node.js 24 job uses disposable PostgreSQL/Mailpit and test-only configuration without repository secrets. It runs lint, TypeScript, hook/startup tests, unit/integration tests, a production build and Chromium tests sequentially.

Inspect results and logs in GitHub Actions. Browser traces/screenshots are not uploaded automatically because they may contain credentials or finding data. CI does not deploy or access the local PC. Required merge checks are configured separately in repository settings.

## Database changes

The Drizzle schema and generated SQL migrations are versioned together. After agreeing ownership, rollout and existing-row treatment:

```sh
npm run db:generate
```

Review the SQL, constraints and backfills before applying it. Verify the target of `DATABASE_URL` without printing credentials, then run:

```sh
npm run db:migrate
```

Generation and application are separate. App startup does not apply migrations. Preserve migration history and existing rows; changes that could discard data need an explicit plan.

The original `0000` migration and scaffold `users` table remain. Additive migrations `0001` through `0005` introduce authentication/workspaces, services, findings, groups and integrations. Legacy scaffold rows are not login accounts because their password format and verification state are unestablished. Register through the application.

## GitHub Dependabot integration

A dedicated GitHub App imports dependency alerts into existing services. Enable Dependabot alerts in each repository first.

Register the App with **Dependabot alerts: read** and default **Metadata: read**, disable webhooks and user authorization, and install it on selected repositories. No public callback URL is needed. Keep the RSA private key outside the repository with restricted permissions, for example `chmod 600 ~/.config/vulnvault/github-app.pem`. Set numeric `GITHUB_APP_ID` and absolute `GITHUB_APP_PRIVATE_KEY_FILE` in `.env.local`. Never paste the key into chat or commit it. Restart long-running host app/worker processes after configuration changes.

Once migrations are applied, bind the installation to the intended workspace:

```sh
npm run github:connect -- --workspace <workspace-slug> --repository <owner/repository>
```

The command verifies App access and maps matching existing service repository links in that workspace. Review its mapping count before importing. An installation cannot silently move to another workspace; reconnecting preserves connection identity and findings.

Owners/admins open **Integrations** from a service for repository setup, status, mapping controls and **Sync now**. Compatible GitHub links produce a recommendation without proving App access. Workspace **Connections** manages shared installation controls. These browser operations require host App configuration; the Docker web container leaves sync disabled. See the [service integration workflow](docs/service-integrations-plan.md).

For continuous polling or a bounded workspace run:

```sh
npm run integrations:worker
npm run integrations:worker -- --once --workspace <workspace-slug>
```

Continuous polling checks due repositories every ten seconds and schedules successful syncs fifteen minutes apart. It retries unexpected polling/database failures; invalid startup configuration stops the command. One-shot mode drains successful due syncs until idle and exits nonzero on failure. Stop a manually launched worker with Ctrl-C; managed-worker commands are in the [startup guide](docs/local-startup.md).

Sync now works without a worker but cannot bypass active leases or retry delays. Status and safe errors appear on each service's Integrations page; refresh to see background changes. Boards update through navigation or reload.

Only previously unseen open alerts create New findings. Subsequent syncs refresh upstream metadata and preserve every locally editable field. Missing alerts or failed pages never imply remediation. Removing a repository link stops its imports while retaining findings/provenance; reconnecting does not duplicate alerts.

Requests use fixed GitHub API destinations, scoped short-lived tokens, a sixty-second operation deadline, ten-second request deadlines, at most twenty pages, 2 MiB per response and 16 MiB total. Limits fail visibly without partial imports. See the [ingestion contract](docs/dependabot-ingestion-plan.md) for ownership, concurrency, retry and provider boundaries.

## Diagnostics and security maintenance

Authentication ignores caller-supplied forwarded IP headers and shares local rate-limit budgets. Its credential transaction guard prevents older credential operations from overtaking recovery. Read [authentication hardening](docs/auth-hardening.md) before Better Auth upgrades or new credential endpoints.

The [diagnostics helper](src/lib/server/diagnostics.ts) emits only allowlisted operation names and failure categories for covered mutation failures. It excludes raw errors and sensitive data, cannot replace the original response, and does not cover every provider/auth/framework failure. The dated [dependency review](docs/dependency-review.md) records unresolved advisories, observed exposure and revisit conditions.

## UI and themes

Light, Dark and System preferences persist without discarding unsaved form state. The board uses fluid columns or mobile status tabs, responsive filters, severity labels/colours and drag or menu status changes. Shared components own current HTML/styling under the enforced ESLint policy.

The UI targets WCAG 2.2 AA. The [UI skill](.agents/skills/ui-styling/SKILL.md) routes to composition, loading, motion and state contracts; the [accessibility review](docs/accessibility-review.md) records coverage and manual limits.

## Commit checks

`npm ci` and `npm install` configure the versioned hook through `prepare`. For an existing checkout:

```sh
npm run hooks:install
npm run hooks:check
npm run test:hooks
```

The hook lints staged JSX/TSX under `src/app` and `src/features`. Current rules reject native HTML and cosmetic `className` overrides there, with shared UI/layout definitions and the root document layout exempt. ESLint errors and warnings block commits.

Only staged source is checked; partially staged working files are not edited or stashed. ESLint configuration/dependencies come from the working tree. Unresolved merges or unavailable checks fail. The installer preserves custom hooks and reports conflicts; integrate explicitly rather than overwriting them. See [AGENTS.md](AGENTS.md) for review and PR policy.
