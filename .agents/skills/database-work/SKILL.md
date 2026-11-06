---
name: database-work
description: Change or review VulnVault PostgreSQL/Drizzle queries, transactions, schemas, or migrations.
---

# Database work

Inspect affected queries and ownership relationships in `src/db/schema.ts`.
Reuse the server client in `src/db/index.ts`. Shared permission and approval
policies remain in `AGENTS.md`.

## Data invariants

- Scope every affected read/write to its authorised workspace and service, reusing
  access predicates across lists, details and mutations. Validate and parameterise
  untrusted input; reject unknown workspace roles.
- Keep related writes and expected-version checks in one transaction. Reject
  stale versions; enforce cross-workspace ownership through database constraints.
- For workspace-sensitive mutations, acquire the workspace permission lock before
  other affected record locks, including membership, service and finding locks in
  that order. Re-read current grants/permissions under lock, including membership
  for human callers. Ordinary finding/service writes use a shared permission lock;
  permission changes use an exclusive one. Follow the full [permission protocol](../../../docs/service-access-groups-plan.md#authorisation-and-concurrency)
  when changing authorisation, membership or locking.

## Read the details needed for the change

- **Schema or migrations:** agree ownership, rollout and existing-row treatment
  before implementation. Use the [README migration instructions](../../../README.md#database-changes)
  and `drizzle.config.ts`; generate with `npm run db:generate`, inspect SQL,
  defaults, constraints and backfills, and version schema, SQL and metadata together.
  Preserve rows and migration history. Keep generation separate from application;
  verify the target of `DATABASE_URL` without printing credentials before
  `npm run db:migrate`. Do not reset databases or apply migrations at app startup.
- **Credentials or Better Auth upgrades:** preserve its schema conventions and
  read [authentication hardening](../../../docs/auth-hardening.md) for the
  credential transaction guard and concurrency/rollback regressions.
- **Ingestion or background jobs:** read the [ingestion concurrency design](../../../docs/dependabot-ingestion-plan.md#polling-and-concurrency)
  for grant, lease and generation fencing. Keep provider I/O outside database locks.

Query-only changes do not require a migration.

## Verification

Use isolated fixtures and `TEST_DATABASE_URL` with the separate Compose test
DB; never run destructive tests on development data. See the
[verification setup](../../../README.md#verification).

Select tests for changed behaviour: permissions and cross-workspace attempts for
ownership queries; rollback, stale versions and concurrency for transaction/lock
changes; existing-row upgrade and fresh setup for migrations. Follow `AGENTS.md`
for application checks and sequential persistence/browser suites. Report whether
migrations were generated, tested or applied, including the target and any checks
that could not run.
