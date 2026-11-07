# VulnVault MVP roadmap

## Direction

Build a useful vulnerability tracker for the owner's projects while learning AI-assisted engineering. Workspaces provide one ownership model for solo developers and teams. Development and optional phone access remain [PC-local](local-hosting.md); public hosting and cloud infrastructure are deferred.

This file owns capability status and priorities. Technical references describe current contracts; working rules live in [AGENTS.md](../AGENTS.md). Reconcile merged work before the next slice.

## Current merged capabilities

| Area | Available now |
| --- | --- |
| [Authentication](auth-workspace-design.md) and [hardening](auth-hardening.md) | Verified email/password accounts, recovery, refreshed seven-day sessions and reset revocation. |
| [Workspaces](workspace-onboarding-plan.md) | Creation, onboarding, multiple memberships and persistent selection. Registration grants no workspace access. |
| [Services](service-management-plan.md) and [access groups](service-access-groups-plan.md) | Services with optional repositories, archive/restore, default or group-restricted access, server isolation and permission locking. |
| [Findings](manual-findings-plan.md), [board](findings-board-plan.md) and [discovery](triage-discovery-plan.md) | Independent service lifecycles, manual entry, six triage statuses, search/source/upstream filters, bounded paging and [drag/menu moves](board-interactions-plan.md). Archived findings are read-only; no deletion. |
| [Dependabot](dependabot-ingestion-plan.md) and [service integrations](service-integrations-plan.md) | Real alert imports, deduplication, retained provenance, independent upstream state, service-scoped setup/status/sync and GitHub recommendations. Workspace connections retain shared installation controls. Polling retries recoverable failures. |
| [UI foundation](ui-foundation-plan.md), [responsive layout](responsive-ui-plan.md) and [accessibility](accessibility-review.md) | Light/dark/system themes, shared controls, responsive filters, stable loading/drafts and keyboard alternatives. |
| [Hosting](local-hosting.md) and [startup](local-startup.md) | Docker LAN/Tailscale access preserving existing data/identity; one-command startup and a configured supervised host worker. Explicit builds; no automatic migrations or enrolment. |
| [Recovery](local-recovery.md) | Private-backup runbook and synthetic restore/upgrade/login rehearsals. Actual private-archive recovery and live cutover are not established. |
| [Verification](../.github/workflows/verification.yml) and [diagnostics](../src/lib/server/diagnostics.ts) | Disposable test infrastructure, CI lint/types/hook/startup/application/build/browser checks, and safe mutation failure categories. |

The dated [dependency review](dependency-review.md) records three underlying open advisories. Dependency removal or upgrades need fresh audit and behaviour checks; the earlier lack of compatible upgrades does not rule out removing unnecessary dependencies.

## Cleanup sequence

Each group is a bounded scope to plan and verify before implementation. Grouping does not authorise live deployment, data changes, repository settings changes or higher reasoning effort.

| Order | Group | Status and scope |
| --- | --- | --- |
| 1 | Working agreement and documentation | Implemented on the feature branch, awaiting merge: consolidated instructions, review effort proportional to risk, stale authorisations/status removed and current technical contracts retained. |
| 2 | UI and dependencies | Planned next: revise feature-component HTML/styling boundaries with lint/hooks; remove unnecessary CSS packages/scaffold after verification; improve board paging focus/retry and field-associated errors; pass counts as data. |
| 3 | Backend and tests | Planned: separate unit/persistence setup, remove duplicate GitHub token/metadata requests and consolidate repeated authorised reads without weakening mutation checks. Organisation-plugin removal is optional when next touching auth. |
| 4 | Operations and repository controls | Planned: verify/enforce PR and CI requirements, simplify startup responsibilities while preserving safeguards, expose running app/worker revisions and remove obsolete worktrees/branches after checking unique work. |
| 5 | Real-project validation | Planned: complete the remediation and actual private-archive trials below, then agree solo-MVP completion. |

## Solo MVP completion

- Import a real fixable advisory, triage it, remediate upstream, refresh its upstream state and explicitly resolve/reopen locally. Dependency cleanup may supply a candidate; do not claim this trial from synthetic fixtures.
- Rehearse recovery of an actual private archive using the [runbook](local-recovery.md), verifying permissions, manual findings, provenance, local decisions and deduplication.
- Agree any live upgrade/cutover separately, including app/worker restart and polling recovery. Record observed results and remaining usability needs before declaring the solo MVP complete.

## Later decisions

Assignment, invitations and member administration remain future work when another user needs to join. Activity history, accepted-risk review dates and bulk actions are optional candidates.

Public CVE matching needs component inventory, versions, relevance rules and noise control. Decide after the trial whether it belongs in the first useful MVP. Additional providers, separate ingestion infrastructure, cloud hosting, enterprise SSO and billing remain outside initial scope.
