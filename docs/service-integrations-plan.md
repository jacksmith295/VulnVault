# Service integrations and workspace connections

Status: implemented, independently reviewed and locally verified on the feature branch, awaiting merge.

## Experience and ownership

Repository integration setup, sync controls and sync status live at `/w/[workspaceSlug]/services/[serviceId]/integrations`. Owners and admins reach this page from the service, including archived services. Members retain finding provenance access through existing service permissions but do not gain integration administration.

The existing workspace `/integrations` route becomes **Workspace connections**, reached through **Connections** on the workspace board. It keeps operator setup guidance, installation identity and global enable/disable controls. Explain that disabling a connection affects every mapped service. Repository selection, mapping controls and status move to the service page.

GitHub is the currently supported integration. Recommend it when the service has a repository URL accepted by the existing GitHub parser. This describes compatibility only, not verified credentials, installation access or Dependabot permissions. Unsupported repository URLs remain valid service links; do not introduce placeholder providers or automatic matching claims.

Show only the current service's mappings, including disabled connections and mappings bound to a previous host App. Connection options require host configuration presence, an enabled installation matching the configured App and an active service. Provider access is still verified by the existing connect operation. Explain missing host setup, installation binding, disabled connections and previous-App mappings distinctly.

Keep the existing archive policy: connect and sync require an active service; repository enable/disable remains available for archived mappings. Imported findings and local decisions remain intact. Global installation controls stay on the workspace page.

## Implementation boundaries

- Separate narrow workspace-connection and service-integration reads. Authorise owner/admin and validate the fixed service in its workspace; service queries select only that service's links and mappings. Use explicit display projections, omitting lease tokens and credentials.
- Require `serviceId` in repository connect, toggle and human sync operations and their Server Actions. Validate link ownership before provider verification and again inside the locked transaction. Scope mapping candidates and writes to the service. Human sync checks the service during claim and after locking; automation keeps its existing workspace-driven behaviour.
- Preserve workspace-first locking, expected versions, integration/mapping fencing, retry behaviour and provider I/O outside locks. No schema, provider or role changes are required.
- Reuse shared UI and existing form controls. Keep valid repository selections through refreshed props and clear only removed or connected options. Conflict recovery returns to the service page for mapping operations and workspace connections for global operations. Use stable keys, bounded responsive layouts, Suspense and matched skeletons.

## Verification

Use isolated PostgreSQL tests for roles/authentication, service-only reads, same-workspace and cross-workspace forged IDs, provider-verification races, archive rules, stale versions and existing worker fencing. Browser checks cover navigation, recommendations versus configuration, disabled/previous-App states, conflict recovery, draft retention, pending/errors, accessible controls, mobile reflow and both themes. Run persistence and browser suites sequentially with lint, TypeScript, hooks, startup regressions and a production build.

The [PostgreSQL integration suite](../tests/integration/integrations.test.ts) and [browser integration flows](../tests/e2e/integrations.spec.ts) cover these boundaries. Local application, hook, startup, lint, TypeScript and build checks passed. Full browser coverage passed, followed by a rebuild and targeted rerun for the final UI refinements. A separate unconfigured-host browser smoke verified truthful configuration guidance and disabled setup using isolated test data.

Independent design and implementation reviews are complete. Obtain a fresh published PR review with head-specific checks before handoff. Operator installation binding, additional providers, live remediation and actual private-archive recovery remain separate work.
