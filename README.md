# VulnVault

VulnVault tracks vulnerabilities across services and repositories, with a dedicated workflow for triage and remediation. Development is local first. Email/password authentication, workspace onboarding, service management, manual findings, and group-based service access are implemented.

See [working agreements](AGENTS.md), [the MVP plan](docs/mvp-plan.md), [the authentication/workspace design](docs/auth-workspace-design.md), [the manual findings design](docs/manual-findings-plan.md), and [service access groups](docs/service-access-groups-plan.md).

## Local setup

Requirements: Node.js 24 LTS, npm, Docker Engine, and Docker Compose. Run all commands from the repository root.

```sh
docker compose up -d --wait
npm ci
cp .env.example .env.local
openssl rand -hex 32
```

Replace `BETTER_AUTH_SECRET` in `.env.local` with the generated value. The example database and SMTP settings match Compose. Keep `BETTER_AUTH_URL=http://localhost:3000` and open the application at that exact origin.

```sh
npm run db:migrate
npm run dev
```

Open [VulnVault](http://localhost:3000) and the [development inbox](http://localhost:8025). Register, open the verification email in Mailpit, follow its link, and log in. Password reset emails also appear in Mailpit. These messages stay local; the inbox does not deliver to real recipients.

Registration creates an account without creating a workspace. After login, users without memberships see onboarding and can create a workspace. Creation makes them its owner. A persistent header has a top-left workspace dropdown with Create workspace + and All workspaces links.

Login opens the last used accessible workspace in this browser, falling back to the first accessible workspace. The preference is scoped to the account and never grants access. Each tab keeps the workspace in its own URL. `/workspaces` lists memberships explicitly. Owners/admins can create and edit services with optional descriptions and repository URLs, archive them, and restore them. Members can view active and archived services their groups grant access to. All workspace roles can create and update findings within active services they can access. Each finding has its own severity, status, remediation notes, and reference URLs. Resolution is independent per service; reopening clears the resolution timestamp. No role can delete findings. Archived services retain readable findings and block changes until an owner/admin restores the service. Workspace invitations and member administration follow later. Plugin organisation APIs remain disabled; creation uses an application Server Action and a database transaction.

The workspace home at `/w/[workspaceSlug]` is its findings board. Services opens `/w/[workspaceSlug]/services`, alongside Groups for owners/admins. The former `/w/[workspaceSlug]/findings` URL redirects to the board after checking workspace access and preserves all query values. Filter by group, service, severity, status, or service archive state; filters remain in the URL. At widths of 1280px and above, six fluid status columns fill the available width without horizontal board scrolling. Smaller screens use status tabs showing one column at a time. Each column starts with 20 newest findings and loads additional pages independently. Totals include all matching accessible findings. Cards link to finding details and offer status changes for active services. Archived-service findings remain read-only.

Initial loading uses React Suspense with stable skeletons for the filters and board. After that, applying or clearing filters keeps the filter panel mounted and replaces only the board with its loading skeleton. Filter options load independently through permission-checked reads. Navigation preserves page scroll and shows pending feedback; browser Back/Forward keeps the controls in sync with the URL. Refreshing the board replaces its cards with current data. Load more also checks for access changes. If a service becomes inaccessible between pages, Load more clears retained cards before refreshing rather than leaving revoked findings on screen. Load more uses an authenticated GET endpoint with caching disabled. The workspace selector saves its navigation preference through a separate authenticated POST endpoint, so background preference writes do not refresh board data or discard loaded pages. See the [findings board plan](docs/findings-board-plan.md) for pagination and status-update guarantees.

Each workspace has a protected Everyone group that automatically includes all workspace members. New services use Everyone until an owner/admin assigns specific groups. With specific groups assigned, membership in any one of those groups grants service and finding access; Everyone no longer grants access. Owners/admins retain access to all services. Existing services keep their current access after upgrading.

Owners/admins can open Groups from the workspace page to create custom groups and select existing workspace members. Manage access on a service switches between default and selected groups. Returning a restricted service to Everyone requires confirmation. Empty custom groups are allowed: if all groups assigned to a service are empty, only owners/admins can access it. Groups cannot be deleted in this slice. Removing and rejoining a workspace does not restore old custom-group memberships.

Authentication ignores caller-supplied forwarded IP headers and shares rate-limit budgets across local users. Credential operations use a per-user PostgreSQL transaction guard so password recovery cannot be overtaken by an earlier login or password change. See [authentication hardening](docs/auth-hardening.md) for the scope, tests, and dependency-upgrade requirements.

Compose exposes PostgreSQL at `localhost:5432`, SMTP at `127.0.0.1:1025`, and the inbox at `127.0.0.1:8025`. Its credentials are development-only. PostgreSQL data persists in the `vulnvault_postgres_data` volume. Stop infrastructure with `docker compose stop`; do not remove its volume unless you intend to erase development data.

## PC-local hosting and phone access

Optional Docker overlays run a production build on your PC for trusted Wi-Fi HTTP access or private Tailscale HTTPS access. They reuse the existing local database and Mailpit when the same Compose project is selected. These modes are alternatives, and the PC must stay awake and online. See [the local hosting guide](docs/local-hosting.md) for setup, project and credential safeguards, access policies, and stopping or switching modes. Normal development continues to use Next.js on the host. Container GitHub sync is disabled; scheduled polling remains a host process.

## Verification

Start the separate, disposable test database from the repository root:

```sh
docker compose --profile test up -d --wait
```

Then, from the repository root:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Set `TEST_DATABASE_URL` as shown in `.env.example`. Tests use the isolated database on port `55433`, never the application database. Integration tests manage their own fixtures and migrations. Browser tests start a separate application server on port `3100` against the test database, apply its migrations, and use Mailpit for real verification and recovery flows. Run integration and browser suites sequentially. Install Playwright's system dependencies if your OS requires them.

The test database uses temporary container storage; its contents are disposable. Browser tests use unique email addresses and do not clear the development inbox. Browser artifacts are ignored by Git and may contain sensitive test data; do not publish them indiscriminately.

### Continuous integration

The [Verification workflow](.github/workflows/verification.yml) runs on pull requests to `main`, pushes to `main`, and manual dispatch. Its Node.js 24 job uses disposable PostgreSQL and Mailpit services and test-only configuration, without repository secrets or a local environment file. It runs lint, TypeScript, hook tests, unit/integration tests, a production build, and Chromium tests in sequence.

Inspect results and ordinary test logs in GitHub Actions. Browser traces and screenshots are not uploaded automatically because they can contain test credentials and finding data. The workflow does not deploy or access the local PC. Making the `Verification` check a merge requirement is a separate repository setting; this change does not configure branch protection.

## Server diagnostics and dependency review

Covered server mutation catches emit a fixed operation name and failure category through the [server diagnostics helper](src/lib/server/diagnostics.ts). These entries exclude raw exceptions, SQL, constraint names, credentials, identifiers, URLs, and finding content. Unknown failures stay categorised as unknown; diagnostic failures cannot replace the existing form response. Expected validation, permission denials, version conflicts, and duplicate workspace slugs retain their existing handling without extra failure entries.

Provider, worker, authentication, and framework logs retain their existing handling. This helper covers the instrumented mutation catches, including integration claim failures, rather than every server error. See the dated [dependency review](docs/dependency-review.md) for unresolved advisories, observed dependency paths, and the conditions for revisiting them. Dependency versions remain unchanged in this slice.

## Database changes

The Drizzle schema and generated SQL migrations are versioned together. Better Auth owns the authentication and workspace-membership schema conventions. After an agreed schema change:

```sh
npm run db:generate
npm run db:migrate
```

Review generated SQL before applying it. Changes that could discard data need an explicit migration plan. Schema generation and applying migrations are separate operations; starting the app does not silently rewrite the database.

The original `0000` migration and scaffold `users` table are preserved. The additive `0001` migration creates Better Auth's tables, `0002` adds services and their repository associations, `0003` adds findings and their references, `0004` adds service access groups and provisions Everyone for existing workspaces, and `0005` adds workspace integrations, repository sync mappings, and retained finding sources with additive ownership indexes. Existing scaffold rows remain intact but do not automatically become login accounts; their password format and verification state have not been established. Register through the application for the new authentication flow.

## GitHub Dependabot integration

A dedicated GitHub App imports dependency alerts into existing services. It does not scan source code or replace GitHub's dependency analysis. Enable Dependabot alerts in each GitHub repository first.

The self-hosting operator registers the App with **Dependabot alerts: read** and the default **Metadata: read**, disables webhooks and user authorization, and installs it on selected repositories. No public callback URL is needed. Keep the downloaded RSA private key outside this repository and restrict its file permissions, for example `chmod 600 ~/.config/vulnvault/github-app.pem`. Add the numeric `GITHUB_APP_ID` and absolute `GITHUB_APP_PRIVATE_KEY_FILE` path to `.env.local`; never paste the key into chat or commit it. These settings are optional until integrations are used. Restart long-running application/worker processes after changing them.

After applying migrations, bind the intended installation to a workspace through the trusted host command:

```sh
npm run db:migrate
npm run github:connect -- --workspace <workspace-slug> --repository <owner/repository>
```

The command authenticates as the App, validates installation/repository access, and connects matching existing service repository URLs only in that workspace. Review the reported mapping count before importing. An installation cannot silently move to another workspace. Reconnecting the same account preserves the connection identity and existing findings.

Owners/admins can open **Integrations** from workspace home to connect other existing repository links, disable a connection or repository, and use **Sync now**. Sync now runs immediately without a worker, but cannot bypass an active sync or retry delay. Other workspace roles cannot administer integrations. Imported finding provenance follows the existing service/group permissions.

For scheduled local polling, run this alongside Next.js:

```sh
npm run integrations:worker
```

The worker checks due repositories every ten seconds and schedules successful syncs fifteen minutes apart. For a bounded run scoped to one workspace:

```sh
npm run integrations:worker -- --once --workspace <workspace-slug>
```

One-shot runs drain successful due syncs until idle and return a nonzero exit status on failure. Continuous polling retries unexpected database/polling failures after ten seconds; invalid startup configuration still stops the command. Repository retry/backoff is persisted, and mappings for another GitHub App do not consume the polling batch. Stop the worker with Ctrl-C. Repository status and safe failure messages are visible in Integrations; refresh the page to see background changes. Loaded boards refresh through normal navigation or reload; live push updates are outside this slice.

Only previously unseen **open** alerts create New findings. Later syncs refresh separate upstream metadata for open/fixed/dismissed/automatically dismissed alerts and preserve every locally editable field. They never automatically resolve, reopen, reject, delete, or overwrite findings. A missing alert or failed page does not imply remediation. Removing a service repository link stops its imports but retains its findings and source history; reconnecting does not duplicate alerts.

Requests use fixed GitHub API destinations, short-lived repository-scoped tokens, a sixty-second operation deadline, ten-second request deadlines, at most twenty pages, 2 MiB per response, and 16 MiB total. Larger repositories fail visibly without a partial import. Unavailable access, missing permission, and disabled Dependabot alerts can share a safe error category. Rate limits and transient failures retain retry times. Private keys, tokens, and raw API responses are never displayed or logged.

See the [ingestion plan](docs/dependabot-ingestion-plan.md) for ownership, migration, concurrency, and verification details. GitLab/Bitbucket, webhooks, public CVE matching, automatic upstream/local status reconciliation, and browser-based installation authorization remain later slices.

## UI and themes

Shared styled Base UI controls live in `src/components/ui`, and reusable page/form/layout structures live in `src/components/layout`. Pages and features compose these TSX components; ESLint prevents native HTML and cosmetic `className` overrides there. Semantic HTML and Tailwind defaults belong in the shared definitions, with typed variants for recurring differences.

Routine pages use bounded widths for inventories, forms, and readable details; the workspace board remains fluid. Board filters are inline from 1024px and use a modal drawer on smaller screens, preserving drafts and URL history. See the [responsive UI plan](docs/responsive-ui-plan.md) for component responsibilities and verification.

Interactive elements use shared motion tokens: drawers slide, floating menus and selects fade/scale, and controls and feedback transition briefly. Reduced-motion preferences remove nonessential movement. Static page content and board layouts stay still.

The green theme supports Light, Dark, and System from the theme menu on both public and authenticated screens. Preferences persist in the browser. Theme colours and typography are centralised in `src/app/globals.css`; changing theme preserves unsaved form state.

The UI targets WCAG 2.2 AA with contrast-aware controls, visible keyboard focus, skip navigation, and themed error pages. See the [accessibility review](docs/accessibility-review.md) for findings, regression coverage, and manual verification limits.

Findings use distinct severity colours in both themes. The board supports status moves through drag handles or the existing menus, including keyboard operation and mobile drop targets. See the [board interactions plan](docs/board-interactions-plan.md) for behaviour and verification scope.

## Delivery

Work on feature branches, with implementation and independent review agents. PRs include behaviour changes and validation evidence and remain for the user's approval before merging. Public deployment is outside the current scope.

### Commit checks

`npm ci` and `npm install` set up the versioned `.githooks` directory through the `prepare` script. For an existing checkout, install explicitly:

```sh
npm run hooks:install
```

The pre-commit hook lints staged JSX/TSX files under `src/app` and `src/features` using the existing ESLint rules. Native HTML and cosmetic `className` overrides are rejected there; shared UI/layout definitions and the root `src/app/layout.tsx` document keep their existing exemptions. All ESLint errors and warnings in the selected files block the commit.

Only staged source contents are checked. Partially staged files are handled without editing, stashing, or staging your working files. ESLint configuration and installed dependencies are read from the current working tree. Unresolved merges and unavailable checks fail rather than silently allowing a commit.

```sh
npm run hooks:check
npm run test:hooks
```

The first command checks the current index. The second runs isolated Git fixtures, including real commit rejection, without PostgreSQL or development data. The installer only changes repository-local Git configuration and preserves existing custom hook setups; if one exists, it reports the conflict so the checks can be integrated explicitly. This is a local commit guard, rather than server-side branch enforcement.
