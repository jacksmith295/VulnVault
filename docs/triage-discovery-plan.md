# Finding search and bounded service lists

Finding discovery and bounded service lists are implemented and merged. Upstream facts and local triage decisions remain independent.

## Behaviour

- Board and service lists search the local finding title, imported package name, GHSA and CVE. Search is a case-insensitive literal substring, trimmed and limited to 200 characters. An empty search has no effect. `%`, `_` and backslashes are ordinary characters.
- Filters combine with AND; search matches any of its four fields. Source offers all findings, Manual (no source record), and Dependabot (`github_dependabot`). Upstream state offers all, Open, Fixed, Dismissed, and Automatically dismissed. An upstream-state filter excludes manual findings. Selecting Manual together with an upstream state yields no matches and a short explanation rather than silently changing selections.
- Existing board group, service, severity, local status and archive filters retain their meaning. Service lists offer search, source, upstream state, severity and local status within the fixed service, including when it is archived.
- Filter values live in the URL. Apply, Clear, Back and Forward preserve existing draft and navigation behaviour. Keep loaded controls mounted and suspend only refreshed results with responsive skeletons. Mobile controls reuse the existing accessible animated drawer.
- Service lists show compact rows with title, severity, local status and relevant source/state context. Fetch at most 20 rows initially and another 20 on Load more, newest first. Omit full descriptions, remediation notes and other detail-only fields. Distinguish an empty service from an empty filtered result.

## Data and entry points

Share the small validation shape and SQL discovery predicate between board and service queries. Keep provider-specific source values explicit without treating a future provider as manual. Counts and pages apply identical predicates after workspace and service access checks. No schema, dependency, index or ingestion changes are required.

Use Server Components for initial results. Additional service rows use an authenticated GET Route Handler at `/w/[workspaceSlug]/services/[serviceId]/findings/more` with private, no-store responses. Mutations continue to use the existing actions; discovery adds no mutations or reconciliation controls.

Strictly reject unknown, duplicate, malformed or unavailable filters without widening results. Additional pages recheck authentication, current service access, normalized filters and a server-computed permission scope. Service cursors must belong to that fixed accessible service. Resolve `(created_at, id)` anchors in PostgreSQL to preserve microseconds; an anchor may cease matching mutable filters without invalidating its ordering position. Missing or inaccessible anchors and changed scopes require a refresh. Discard stale responses, deduplicate appended rows, and evict retained rows when access changes.

## Verification boundaries

Use isolated PostgreSQL tests for search fields, null CVE, literal special characters, validation, four upstream states, filter combinations, count/page parity, timestamp ties, mutable anchors, cross-service/workspace attempts, permission revocation and authentication failures. Browser checks cover board and service filtering, bounded loading, URL/history/Clear, pending drafts and results-only loading, mobile drawer use, themes and reflow.

Historical delivery checks passed lint, TypeScript, production build, hooks and unit/integration checks. [Discovery browser regressions](../tests/e2e/triage-discovery.spec.ts) cover streaming drafts, mobile filters, stale responses, HTTP validation and access eviction. The existing resize-focus regression now expects Search findings as the first control and passed its focused rerun. Axe scans and desktop/mobile theme inspection passed; these checks do not establish complete WCAG conformance.

Actual private-archive recovery, live remediation/polling verification, assignment, bulk actions and upstream reconciliation remain separate work.
