# Dependabot ingestion

Status: implemented and independently reviewed for PR preparation. The user authorised planning, review, implementation, iteration, and a PR, including higher-effort agents when warranted.

The [service integration workflow](service-integrations-plan.md) supersedes this slice's workspace-level repository UI. Installation authorisation remains shared; repository setup, controls and status belong to each service.

## First working slice

Connect a dedicated GitHub App to a workspace, link existing GitHub repository URLs to that installation, and import real Dependabot dependency alerts into service findings. Add automatic local polling and Sync now using the same bounded sync path. Retain support for future providers through explicit provider/source identities, without a plugin framework, message broker, cloud service, or webhook endpoint.

Owners/admins manage and sync connections. Members can read provenance only through findings in services their groups grant access to. GitHub authentication remains separate from VulnVault login.

## Trust and configuration

The self-hosting operator supplies optional GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_FILE configuration. Keep the PEM outside the repository and never expose/log it, JWTs, installation tokens, API bodies, or raw upstream errors. Disabled/unconfigured integration must not break existing authentication or pages. Use Node crypto for short-lived RS256 app JWTs and repository-scoped installation tokens; no SDK dependency is needed.

An explicit host command binds an app installation to a workspace. It verifies app identity, account ID/login, installation identity, suspension, and Dependabot read permission through the app-authenticated API. It must reject installation reassignment to another workspace and app changes on reconnect. This operator grant supplies the authorization that an installation ID or setup redirect alone cannot prove. The browser may manage only its already-bound workspace integration and may never enumerate the operator app's other installations. OAuth, automatic App registration, and public installation callbacks are deferred.

The bootstrap command accepts a workspace slug and repository full name, finds that repository's installation, and connects matching existing service repository links in that workspace. Live setup will target the existing VulnVault service. No fake Dependabot findings or reuse of connector credentials.

## Additive data design

Three tables and the minimum composite uniqueness indexes needed for foreign keys:

- workspace_integration: stable ID, workspace, provider, app/installation/account IDs and account login, enabled/version, and installation-wide rate-limit-until. Unique installation identity cannot move between workspaces. Disconnect disables, rather than deleting, the connection; reconnect reuses its ID.
- integration_repository: workspace/integration/service and existing service_repository link, immutable GitHub repository ID and current full name, enabled/version, next attempt, last attempt/success, bounded error category, failures, and fenced lease token/expiry. Enforce service/integration/repository-link ownership with composite foreign keys. Removal of a repository link removes its live mapping atomically through its foreign key, while retaining findings and provenance. Re-adding a mapping cannot duplicate alerts.
- finding_source: one source association per finding, workspace/service ownership enforced by composite keys, provider/source kind, repository ID, alert number, current upstream state/timestamps, package/ecosystem/manifest, GHSA/CVE, vulnerable range and first patched version, current upstream summary/severity, canonical source URL, and last seen. Uniqueness is per service + source kind + immutable repository ID + alert number, independent of removable mapping/integration row IDs. Retain provenance across disconnect, repository removal, and reconnect.

No existing data reset/backfill is required. Existing manual findings have no source row. Generate an additive Drizzle migration, inspect SQL, test upgrading the existing test database, and apply to development only after those checks. Live imports are authorised by the user; use only the intended workspace/service for the first verification.

## Finding lifecycle

Fetch all alert states: open, fixed, dismissed, and auto_dismissed. Create a finding only for a previously unseen open alert, initially New, with bounded readable title/description, upstream severity, and source reference. An absent/fixed/dismissed alert does not create a new historical finding.

After import, every editable local field stays under local control: status, severity, title, description, notes, references, and resolution timestamps. Update only the separate upstream source metadata on later syncs. Do not automatically resolve, reject, reopen, delete, or overwrite local edits. Missing alerts, pagination failures, or access failures never imply resolution or deletion. Show upstream state separately in finding details. A later slice can add explicit reconciliation actions after product agreement.

## Polling and concurrency

Use one small local worker command, with a one-shot/workspace option for setup and verification. Poll due enabled mappings at a modest default interval (15 minutes); Sync now uses the same engine. Database-backed per-repository leases allow web actions and one or more worker processes to coordinate without another queue service. Claim jobs in a short transaction, issue HTTP requests outside database locks, and commit each complete repository snapshot atomically. Never persist partial-page results.

Use a random lease token and database-clock expiry. Success, failure, and lease release must be conditional on the same current token and configuration generation; expired/replaced workers cannot write findings, status, or unlock a newer job. Bound network work so it finishes well inside the lease. Read current installation enablement/rate block before starting; Sync now may expedite a normal due time but cannot bypass an active lease or provider backoff. Honor Retry-After/reset headers and use capped exponential retry delay for other failures, with visible safe categories and manual recovery.

The integration is an explicit automation principal, independent of the enabling admin's future membership. Revocation means disabling the integration/mapping or removing the linked repository. All mutations follow one order: workspace permission lock, membership if human, service when required, integration, mapping, then finding/source rows. Worker commits lock the workspace first and re-read integration grant, mapping/token/generation, repository link, and active service. Disconnect/configuration changes take exclusive workspace permission lock, invalidate leases/generations, and retain imported findings. Service edit/archive uses the existing protocol; old in-flight results must be rejected after repository removal or archival. Never perform network I/O while holding these locks.

## Provider boundary and limits

Only api.github.com requests with fixed, validated paths. Treat linked URLs only as initial github.com owner/repository candidates. Reject credentials, arbitrary API origins, redirects and pagination destinations that could leak authorization. Resolve canonical repository metadata and compare immutable repository IDs before importing; rename is supported by ID, while path reuse with another ID fails closed. Verify current installation access and scope tokens to the repository for alert polling.

Use explicit current API version 2026-03-10, validated bounded responses, request/deadline limits, and bounded pagination. Exceeding limits is a visible failed sync, not a partial success. Non-rate 403/404 means unavailable access/permission/alerts, not an empty repository; do not request Administration permission just to distinguish those cases. Store only bounded normalized error categories, not API payloads.

## UI and entry points

- Workspace Integrations page: owner/admin only, installation identity/status, linked repositories, last success/failure, Connect repository from existing service links, disable/disconnect and Sync now. Use existing shared components, responsive widths, Suspense/skeleton boundaries, and motion conventions.
- Finding detail: source provenance and upstream state, available only through existing authorized service/finding reads.
- Server Actions: authenticated management/sync, authoritative validation, expected versions for configuration changes, workspace-first authorization.
- Host CLI: operator bootstrap, private-key configuration, optional one-shot sync. Background worker: due jobs and safe status logging. No new public callback or ingestion HTTP endpoint.

## Verification and review

Review the plan before coding and the implementation before PR creation; obtain a fresh exact-head published review afterward. Use high effort for security/concurrency review where useful and medium for bounded implementation.

Provider tests cover JWT claims/signature, bounded and schema-validated API responses, pagination, redirects/origin restrictions, timeouts, metadata identity mismatch, installation validation, and rate-limit parsing. PostgreSQL tests cover tenant/role/group isolation, source uniqueness and preserved local fields, all upstream states, concurrent/repeated sync, stale lease fencing, disconnect/reconnect during fetch, repository remove/re-add and rename/path reuse, archive during fetch, partial-page rollback, and backoff that Sync now cannot bypass. Include signed-out/unverified and member management failures. Use isolated test data and the separate database; never destructive tests on development data.

Browser tests cover setup guidance without credentials, connection/mapping controls, safe errors and pending state, provenance visibility, and existing responsive/auth/group/finding regressions. Test provider responses through an injected test transport or boundary mock, never a production localhost API override. Run persistence and browser suites sequentially, lint, TypeScript, production build, skill/hook checks as appropriate. Then attempt a genuine VulnVault import using operator-provided App credentials; distinguish imported alerts, zero alerts, disabled upstream features, and unavailable credentials accurately.

## Sources checked

- https://docs.github.com/en/rest/dependabot/alerts
- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api

## Design review outcome

High-effort security review approved the design. Reconnect must reuse workspace/app/account identity, validate any replacement installation, and invalidate prior generations/leases. Every finalizer checks token, generation, and database-clock expiry, including expired but unreplaced jobs. Each commit covers one mapping/service. Sync now works without the worker. The first live import targets only the existing VulnVault service; report scope before importing if bootstrap matches more than one link.

## Implementation review and verification

High-effort implementation review identified and resolved three important cases: public repository metadata must be followed by repository-scoped token validation, older overlapping source snapshots must not regress newer upstream metadata, and worker failures must be delayed with one-shot failures terminating nonzero. Both command cleanup paths handle configuration/connection failures safely. Host provisioning lives in a Node-compatible operator module, separate from Next.js request APIs.

Lint, TypeScript, a warning-free production build, all 112 automated tests, and all 23 Chromium tests passed. Provider/configuration tests use generated test keys and injected transports. Browser/test processes explicitly clear host GitHub credentials; no test fixture can use the real installation. The additive migration passed against the isolated database before application to local development. Existing data was preserved.

A real GitHub App installation was authenticated and bound to the existing VulnVault service only. The initial attempt correctly recorded unavailable access while upstream Dependabot alerts were disabled. After the user enabled alerts, real findings were imported and source refresh/reconnect was exercised. No synthetic findings were inserted into development data. App secrets remain outside version control.

Live verification finished with three imported findings (two medium, one low). GitHub added one alert while its initial analysis was populating; a subsequent reconnect and full sync imported zero new findings. The scoped local polling worker was started for the VulnVault workspace.
