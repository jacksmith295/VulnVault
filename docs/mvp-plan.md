# VulnVault MVP roadmap

## Direction

Build a useful vulnerability tracker for the owner's real projects, while learning AI-assisted engineering. Keep delivery in small, reviewed slices. This roadmap records current capabilities and priorities; detailed behaviour belongs in the linked feature plans. Agree on each feature's design and acceptance criteria before implementation.

The initial product is self-hosted locally: Next.js on the host for development, PostgreSQL and development email through Docker Compose. Optional [PC-local Docker hosting](local-hosting.md) supports phone access through trusted Wi-Fi or private Tailscale, with the PC remaining awake and online. Workspaces own services, findings, and integrations for solo developers and teams. Registration grants no workspace access. Authentication remains independent of repository providers. Public deployment and cloud infrastructure remain deferred.

## Current merged capabilities

| Area | Available now |
| --- | --- |
| [Authentication](auth-workspace-design.md) and [hardening](auth-hardening.md) | Email/password accounts, required email verification, password reset, logout, protected access, and seven-day sessions refreshed with activity. Reset revokes existing sessions. |
| [Workspaces](workspace-onboarding-plan.md) | Creation, onboarding, multiple memberships, and a persistent workspace selector with independent context for explicit URLs. Invitation and member-administration UI remain future work. |
| [Services](service-management-plan.md) | Create, edit, archive, and restore. Repository links are optional: a service can have zero or multiple repositories. |
| [Service access](service-access-groups-plan.md) | Default all-member access or custom groups, server-enforced workspace isolation, and workspace-first permission locking. Owners/admins manage services and groups; members access permitted services. Broadening access to the default group requires confirmation. |
| [Manual findings](manual-findings-plan.md) | One service per finding; New, Triaged, In progress, Resolved, Rejected, and Accepted risk statuses, with reopening. Every known workspace role can create/update accessible findings. No role can delete findings; archived-service findings are read-only. |
| [Workspace board](findings-board-plan.md), [interactions](board-interactions-plan.md), and [responsive UI](responsive-ui-plan.md) | Authorised filters, bounded columns with Load more, status menus and dragging, mobile status tabs, and responsive filters. [Shared UI and themes](ui-foundation-plan.md) support light/dark/system preferences. |
| [Dependabot ingestion](dependabot-ingestion-plan.md) | Operator-bound GitHub App installations, workspace repository mappings, local polling and Sync now, recoverable sync status, deduplication, and retained provenance. Real alerts have been imported. Upstream state refreshes independently of local triage and edits. |
| [PC-local hosting](local-hosting.md) | Optional production Docker app for trusted Wi-Fi HTTP or private Tailscale HTTPS. Existing Compose data and device identity are retained; the inbox stays local. Container GitHub sync is disabled; polling uses the host worker. |
| [CI verification](../.github/workflows/verification.yml) | Node.js 24 checks on PRs and `main`, with disposable PostgreSQL/Mailpit and sequential lint, TypeScript, hook, application, build, and Chromium checks. |

Reliability fixes from PR #16 are merged: continuous polling recovers from unexpected database failures, configured-App mappings cannot be starved by old mappings, mobile status selection and valid drafts survive refreshes, and integration toggle failures return recoverable feedback. Worker, PostgreSQL, and browser regressions cover these outcomes alongside existing permission, concurrency, and data-preservation checks.

## Next delivery slices

### 1. Safe diagnostics and dependency triage

CI verification is merged. Safe mutation-failure diagnostics and a dated [dependency triage](dependency-review.md) are implemented on the feature branch, awaiting review, verification, and merge. Diagnostic entries contain only allowlisted operations and categories; existing client feedback, permissions, transactions, and specialised auth/provider handling remain unchanged. The three dependency advisories remain open because compatible patched parent releases are unavailable; the review records exposure limits and revisit conditions, with package versions unchanged.

After this slice merges, start the real-project recovery trial below. Revisit dependencies when compatible fixes or affected usage change, preserving the [authentication hardening checks](auth-hardening.md). Separate quick unit-test setup from database setup when demonstrated development needs justify it.

### 2. Real-project trial and local recovery

Use the owner's projects to validate import, triage, remediation, and recovery before expanding integrations. Practise local backup/restore and an upgrade with existing data, including application/worker restart and polling recovery. Document repeatable steps and remaining gaps.

The solo MVP is useful when the owner can import relevant alerts, triage them, fix the project upstream, verify refreshed upstream state, and explicitly resolve or reopen the local finding. Repeated sync must avoid duplicates and preserve local decisions. Manual findings, access boundaries, and durable data must remain reliable through restart, restore, and upgrade.

Use this trial to agree on completion and discover the next usability needs.

### 3. Triage usability design

Design imported-finding search across title, package, GHSA, and CVE, plus source and upstream-state filters. Make service finding lists compact and bounded; they currently load all rows. Agree on explicit reconciliation behaviour before adding actions that apply upstream changes locally. Preserve the separation between upstream facts and local decisions.

## Planned improvements

- **Service-level integrations and recommendations:** Move repository integration setup, sync controls, and status into each service. Prioritise compatible integrations from its linked repository URLs: for example, a linked VulnVault GitHub repository should put GitHub integration at the top. Recommendations must distinguish compatibility from actual configuration/access. Retain shared workspace installation authorisation where needed and existing permissions; agree those boundaries before implementation.
- **One-command PC startup:** Add a documented command or script to run after boot that brings up Docker, PostgreSQL, Mailpit, the app, Tailscale when selected, and the configured integration worker. Reuse the existing Compose project, volumes, and device identity; avoid duplicate processes, wait for health, and report the phone URL or actionable setup errors. Agree privilege and rebuild handling; do not silently migrate data or re-enrol Tailscale.

## Later decisions

Assignment, invitations, and member administration remain agreed future work. Design them when another user needs to join. Activity history, accepted-risk review dates, and bulk actions are optional candidates rather than committed MVP scope.

Public CVE matching needs component inventory, versions, relevance rules, and noise control; a feed alone cannot identify affected services. Decide after the trial whether it belongs in the first useful MVP. Additional repository providers, separate ingestion infrastructure, cloud hosting, enterprise SSO, and billing remain outside initial scope.
