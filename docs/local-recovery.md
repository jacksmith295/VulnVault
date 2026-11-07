# Local backup and recovery rehearsal

This Bash runbook rehearses recovery into an isolated database and a loopback-only app. It does not switch the live installation, restart its app/worker, or prove live polling recovery. Use a separate clean checkout of the reviewed recovery target with Node.js 24 and `npm ci`; building there avoids replacing a live host app's `.next` output. Run commands from that checkout's repository root. Do not copy production environment files into it.

## Preserve the installation

Identify and export the **original** `VULNVAULT_COMPOSE_PROJECT` using the [hosting guide](local-hosting.md#preserve-the-existing-compose-project-and-data), even from this separate checkout. Every Compose command below uses that project explicitly and the base file only. Never run an unscoped `up`, restart the production app, or use `down -v` here.

A dump contains password hashes, sessions, private findings, and integration metadata. Keep it private, with an encrypted copy off the PC for hardware loss. Preserve `.env.local`, the authentication secret, external GitHub App PEM, and the `tailscale_state` volume separately as credentials. A database dump is not a whole-machine backup; it excludes Docker device identity, configuration, keys, and PostgreSQL cluster roles.

## Take a private archive

The example uses the existing database container's PostgreSQL 17 tools and local socket, without a database URL or password on the command line. Replace the nonsensitive role/database names if this installation differs. Confirm its server major is 17 before proceeding; stop and review tool compatibility for another major. Record the running app's exact code revision and migration level alongside the archive, not just the recovery checkout revision.

```bash
export VULNVAULT_BACKUP_DIR="$HOME/.local/share/vulnvault-backups"
export VULNVAULT_BACKUP_FILE="$VULNVAULT_BACKUP_DIR/vulnvault-$(date -u +%Y%m%dT%H%M%SZ).dump"
(
  set -euo pipefail
  umask 077
  install -d -m 700 "$VULNVAULT_BACKUP_DIR"
  set -o noclobber
  docker compose -p "$VULNVAULT_COMPOSE_PROJECT" -f compose.yaml exec -T db \
    psql --username=vulnvault --dbname=vulnvault -Atc 'SHOW server_version;'
  docker compose -p "$VULNVAULT_COMPOSE_PROJECT" -f compose.yaml exec -T db \
    pg_dump --username=vulnvault --dbname=vulnvault --format=custom \
    > "$VULNVAULT_BACKUP_FILE"
  docker compose -p "$VULNVAULT_COMPOSE_PROJECT" -f compose.yaml exec -T db \
    pg_restore --list < "$VULNVAULT_BACKUP_FILE" > /dev/null
)
```

Stop on any failure. An empty, partial, or merely listable archive is **unverified** until a full restore and application checks succeed. Retain the original archive unchanged; sanitise only the restored copy. Record its private location, date, PostgreSQL major, source revision/migrations, recovery target revision, and rehearsal outcome without recording credentials or evidence in Git.

PostgreSQL documents consistent online snapshots in [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html). A snapshot does not include later writes. Review warnings; do not treat a successful exit as an application recovery check.

## Restore, migrate, and sanitise the copy

Select only a trusted archive from your own installation. Restoring an archive executes its SQL, as described in [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html). Do not run other integration/browser suites against this test cluster during the rehearsal. Its temporary storage is disposable, so it cannot hold the only backup.

Start only the test database, leaving the live app and inbox alone:

```bash
(
  set -euo pipefail
  docker compose -p "$VULNVAULT_COMPOSE_PROJECT" -f compose.yaml --profile test up -d --wait postgres-test
)
export VULNVAULT_RESTORE_FILE="$VULNVAULT_BACKUP_FILE" # Or an existing trusted archive's absolute path.
export VULNVAULT_RESTORE_DB="vulnvault_restore_$(date -u +%Y%m%dT%H%M%SZ)_test"
```

Create a dedicated temporary inbox on loopback ports `11025` and `18025`. Do not reuse or replace an existing container if these ports are busy. Capture its ID only after successful startup; keep it for readiness checks and cleanup. Do not start or reconfigure the original Compose Mailpit service.

```bash
if VULNVAULT_RECOVERY_MAILPIT_ID=$(docker run --detach --rm \
  --publish 127.0.0.1:11025:1025 --publish 127.0.0.1:18025:8025 \
  axllent/mailpit:v1.27.4); then
  export VULNVAULT_RECOVERY_MAILPIT_ID
else
  unset VULNVAULT_RECOVERY_MAILPIT_ID
  printf '%s\n' 'Inbox startup failed. Stop here; do not launch the preview.' >&2
  false
fi
```

Review the checked-out migrations and their target before this block. It uses the default isolated test role on host port `55433`, never the application database. `createdb` fails if the name already exists; `set -e` then prevents restoration. Do not add `--clean` or `--create` to `pg_restore`.

```bash
(
  set -euo pipefail
  [[ "$VULNVAULT_RESTORE_DB" =~ ^vulnvault_restore_[0-9]{8}T[0-9]{6}Z_test$ ]]
  test -s "$VULNVAULT_RESTORE_FILE"
  docker compose -p "$VULNVAULT_COMPOSE_PROJECT" -f compose.yaml exec -T postgres-test \
    createdb --username=vulnvault_test --template=template0 "$VULNVAULT_RESTORE_DB"
  docker compose -p "$VULNVAULT_COMPOSE_PROJECT" -f compose.yaml exec -T postgres-test \
    pg_restore --username=vulnvault_test --dbname="$VULNVAULT_RESTORE_DB" \
    --single-transaction --exit-on-error --no-owner --no-privileges < "$VULNVAULT_RESTORE_FILE"
  export DATABASE_URL="postgresql://vulnvault_test:vulnvault_test_only@127.0.0.1:55433/$VULNVAULT_RESTORE_DB"
  npm run db:migrate
  docker compose -p "$VULNVAULT_COMPOSE_PROJECT" -f compose.yaml exec -T postgres-test \
    psql --username=vulnvault_test --dbname="$VULNVAULT_RESTORE_DB" --set=ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DELETE FROM "session";
DELETE FROM "verification";
UPDATE workspace_integration SET enabled = false, version = version + 1;
UPDATE integration_repository SET enabled = false, version = version + 1,
  lease_token = NULL, lease_expires_at = NULL;
COMMIT;
SQL
)
```

Stop if any step fails; do not launch the preview. Apply real current Drizzle migrations before sanitisation because older archives can lack integration tables. Preserve migration history and existing rows; do not reset the schema or rewrite its ledger. Keep all app/worker processes off this restored database until sanitisation completes.

Deleting sessions and verification records prevents restored sessions and outstanding recovery/verification links from remaining usable. Older archives also restore older password hashes: review/reset credentials before any real cutover. Rotating the authentication secret alone does not replace session/token revocation. See [authentication hardening](auth-hardening.md).

## Check the recovered app

This subshell overrides the app settings below without editing the live environment. It uses the dedicated local Mailpit, a rehearsal-only secret and origin, and no GitHub App credentials. Keep all workers and provider imports disabled until a separate operator review. Its readiness check must pass before the preview starts; if Mailpit is still starting, wait and repeat the check before proceeding.

```bash
(
  set -euo pipefail
  [[ "$VULNVAULT_RESTORE_DB" =~ ^vulnvault_restore_[0-9]{8}T[0-9]{6}Z_test$ ]]
  [[ "$VULNVAULT_RECOVERY_MAILPIT_ID" =~ ^[0-9a-f]{64}$ ]]
  docker exec "$VULNVAULT_RECOVERY_MAILPIT_ID" /mailpit readyz
  export DATABASE_URL="postgresql://vulnvault_test:vulnvault_test_only@127.0.0.1:55433/$VULNVAULT_RESTORE_DB"
  export BETTER_AUTH_URL=http://127.0.0.1:3101
  export BETTER_AUTH_SECRET=recovery-rehearsal-only-secret-never-use-live
  export SMTP_HOST=127.0.0.1 SMTP_PORT=11025
  export SMTP_FROM='VulnVault recovery <noreply@vulnvault.local>'
  export GITHUB_APP_ID='' GITHUB_APP_PRIVATE_KEY_FILE=''
  export VULNVAULT_STANDALONE=0
  npm run build
  npm run start -- --hostname 127.0.0.1 --port 3101
)
```

Open `http://127.0.0.1:3101`. Check login, workspace membership, restricted service access, archived-service read-only behaviour, finding values/versions, local triage decisions, and imported provenance against the expected snapshot. Confirm integrations are disabled. Use only the dedicated inbox at `http://127.0.0.1:18025` for new recovery messages. Record results privately; this preview still contains sensitive real data.

The browser suite adds automated **synthetic** rehearsals for a real Drizzle `0000` through `0004` baseline upgraded to current migrations and a current full snapshot with integration/session/lease data. It restores, sanitises, and checks recovered Next.js login. These checks do not establish that the owner's archive is recoverable, a live upgrade succeeds, or polling resumes correctly.

## Finish and future cutover

Stop the preview with Ctrl-C first. Remove only the exact database and stop only the dedicated inbox captured above; its `--rm` flag removes it on stop. Never stop the original inbox. Keep the archive and private outcome record:

```bash
(
  set -euo pipefail
  [[ "$VULNVAULT_RESTORE_DB" =~ ^vulnvault_restore_[0-9]{8}T[0-9]{6}Z_test$ ]]
  [[ "$VULNVAULT_RECOVERY_MAILPIT_ID" =~ ^[0-9a-f]{64}$ ]]
  docker compose -p "$VULNVAULT_COMPOSE_PROJECT" -f compose.yaml exec -T postgres-test \
    dropdb --username=vulnvault_test "$VULNVAULT_RESTORE_DB"
  docker stop "$VULNVAULT_RECOVERY_MAILPIT_ID"
)
```

A future real upgrade/cutover needs an agreed target and migration plan, a verified backup, and stopped app/worker writers before the final snapshot. Rehearse migrations, rebuild, then check login, permissions, findings and restart behaviour before separately reviewing provider enablement and polling. Roll back by restoring into a new database with matching code/configuration; do not point an older binary at a migrated schema. Live cutover and the real-project remediation/polling trial remain separate follow-up work.
