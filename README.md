# VulnVault

VulnVault tracks vulnerabilities across services and repositories, with a dedicated workflow for triage and remediation. Development is local first. Email/password authentication, workspace onboarding, and service management are implemented. Findings follow incrementally.

See [working agreements](AGENTS.md), [the MVP plan](docs/mvp-plan.md), and [the authentication/workspace design](docs/auth-workspace-design.md).

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

Login opens the last used accessible workspace in this browser, falling back to the first accessible workspace. The preference is scoped to the account and never grants access. Each tab keeps the workspace in its own URL. `/workspaces` lists memberships explicitly. Owners/admins can create and edit services with optional descriptions and repository URLs, archive them, and restore them. Members can view active and archived services. Invitations, member administration, and findings follow later. Plugin organisation APIs remain disabled; creation uses an application Server Action and a database transaction.

Compose exposes PostgreSQL at `localhost:5432`, SMTP at `127.0.0.1:1025`, and the inbox at `127.0.0.1:8025`. Its credentials are development-only. PostgreSQL data persists in the `vulnvault_postgres_data` volume. Stop infrastructure with `docker compose stop`; do not remove its volume unless you intend to erase development data.

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

## Database changes

The Drizzle schema and generated SQL migrations are versioned together. Better Auth owns the authentication and workspace-membership schema conventions. After an agreed schema change:

```sh
npm run db:generate
npm run db:migrate
```

Review generated SQL before applying it. Changes that could discard data need an explicit migration plan. Schema generation and applying migrations are separate operations; starting the app does not silently rewrite the database.

The original `0000` migration and scaffold `users` table are preserved. The additive `0001` migration creates Better Auth's tables, and `0002` adds services and their repository associations. Existing scaffold rows remain intact but do not automatically become login accounts; their password format and verification state have not been established. Register through the application for the new authentication flow.

## UI and themes

Shared styled Base UI controls live in `src/components/ui`, and reusable page/form/layout structures live in `src/components/layout`. Pages and features compose these TSX components; ESLint prevents native HTML and cosmetic `className` overrides there. Semantic HTML and Tailwind defaults belong in the shared definitions, with typed variants for recurring differences.

The green theme supports Light, Dark, and System from the theme menu on both public and authenticated screens. Preferences persist in the browser. Theme colours and typography are centralised in `src/app/globals.css`; changing theme preserves unsaved form state.

## Delivery

Work on feature branches, with implementation and independent review agents. PRs include behaviour changes and validation evidence and remain for the user's approval before merging. Public deployment is outside the current scope.
