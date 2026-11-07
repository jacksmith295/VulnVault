# Working on VulnVault

## Product and architecture

VulnVault tracks vulnerabilities across services and repositories. Workspaces own services, findings and integrations for solo developers and teams. Manual findings and Dependabot ingestion are implemented; keep other repository providers possible without speculative infrastructure. See the [MVP roadmap](docs/mvp-plan.md) for current capabilities and next steps.

Retain Next.js App Router, TypeScript, Tailwind, Base UI and local PostgreSQL. Use Server Components for initial reads, Server Actions for application mutations, and Route Handlers where the request contract needs them. Discuss material architecture changes before implementation; do not introduce a separate backend by default.

Normal development runs Next.js on the host and PostgreSQL/Mailpit in Compose. Optional [PC-local Docker hosting](docs/local-hosting.md) supports trusted Wi-Fi or private Tailscale access. Public deployment and cloud provisioning require separate agreement. Document infrastructure setup with safe example configuration.

## Working agreement

- Before coding a feature, discuss scope, behaviour, design choices, verification and unresolved questions. After agreement, complete the scope autonomously; choose routine implementation details independently.
- Discuss changes to architecture, data ownership, schema, migrations or agreed behaviour before implementing them. Continue useful independent work while awaiting answers.
- Preserve user changes. Do not revert unrelated edits or include them in commits without permission.
- Prefer focused structures that meet demonstrated needs. Write readable code; comments explain intent, constraints and non-obvious behaviour. Use plain language and avoid em dashes in authored prose and comments.
- The user is learning AI-assisted engineering. Explain key choices, then finish with changes, verification, limitations and concrete next steps. Distinguish delivered work from proposals.
- Keep the roadmap current when scope, delivery status or priorities change. Reconcile merged work before the next slice; distinguish planned, implemented and merged work without accumulating PR history.

## Instructions and references

`AGENTS.md` owns shared working rules and approval boundaries. Skills own recurring task workflows, README owns setup/commands, the roadmap owns status/priorities, and technical references own detailed contracts and rationale. Link to the authoritative source instead of repeating it. Historical plans and verification records do not grant permission for new work or establish current verification.

Use the relevant skill:

| Task | Skill |
| --- | --- |
| Pages, forms, shared components, styling or themes | [UI and styling](.agents/skills/ui-styling/SKILL.md) |
| Queries, schema, migrations or transactions | [Database work](.agents/skills/database-work/SKILL.md) |
| Plan, implementation or PR review | [Review](.agents/skills/review/SKILL.md) |

## Delegation and review

- Delegate bounded work when responsibilities can be separated cleanly. The coordinator may implement small changes directly. Give agents clear ownership and acceptance criteria; avoid conflicting edits.
- Obtain independent design review for architecture, schema, permissions, authentication, concurrency or material behaviour decisions. Obtain independent implementation review for substantive features, fixes and changes to safety or working rules. Small documentation or mechanical edits may use proportionate self-review unless their consequences warrant independence.
- Address findings and verify fixes. Before PR handoff, assess the published result using the [review skill](.agents/skills/review/SKILL.md). Reuse an identifiable independent review when it covers the code and relevant base; review substantive changes or missing evidence before relying on it. Report unresolved concerns.
- Choose model and reasoning effort separately and explicitly where tools permit, including for delegated agents. Use low effort for routine work and medium for implementation, debugging and substantive review. Effort above medium requires the user's explicit approval for that scope; a model switch or difficult task does not grant it. Explain relevant tool limitations once per session, never claim an unperformed model/effort change, and do not alter user-wide configuration without permission.

## Ownership and permissions

- Registration creates no workspace or membership. A user may create a workspace and become its owner, or eventually join by invitation. A user may belong to multiple workspaces; solo users use the same model. Invitation behaviour needs a separate design agreement.
- Enforce verified authentication and workspace/service permissions at server entry points. Keep authentication independent of repository integrations; secrets stay server-side. Validate untrusted input and never log secrets, session tokens, passwords or sensitive vulnerability evidence.
- Owners control ownership and destructive settings; admins manage routine workspace settings and members when those features are implemented. Owners/admins can access all services and manage services, groups and service access.
- Each workspace's implicit all-member default group grants service access unless specific groups are assigned. Membership in any assigned group grants access. Returning a restricted service to the default group requires explicit confirmation. Group deletion is deferred.
- Service creation, edits, archive and restore require owner/admin membership. Every known workspace role can create/update findings in accessible active services. No role can delete findings. Each finding belongs to one service with an independent resolution lifecycle; findings in archived services are read-only until an owner/admin restores the service.
- Agree migrations and existing-row treatment before schema changes. Preserve data and migration history. Workspace-sensitive mutations acquire the workspace permission lock before membership, service and finding locks, then re-read permissions under lock. Follow the [permission protocol](docs/service-access-groups-plan.md#authorisation-and-concurrency) and database-work skill.
- Require email verification, seven-day sessions refreshed with activity, and session revocation after password reset. Preserve the credential transaction guard and local throttling policy; review [authentication hardening](docs/auth-hardening.md) before Better Auth upgrades or new credential endpoints. Never trust arbitrary forwarded IP headers or disable throttling for tests.

## UI and verification

Follow the UI skill for composition, accessibility, themes, loading and form-state preservation. The current ESLint rules keep native HTML and Tailwind classes in shared UI/layout definitions, with the root document layout exempt. Pages and features compose those components; a future rule change must update instructions and enforcement together.

Run lint and TypeScript checks for relevant application changes, and a production build when appropriate. Add meaningful tests for business rules, permissions, persistence and important failures, including authentication/authorisation failures. Check affected user flows in a browser when available; otherwise state concrete manual checks still needed. For documentation-only changes, verify links, commands, consistency and any changed skills.

Use targeted checks during iteration and after fixes. Reuse applicable results for unchanged code; a new reviewer alone does not require repeating full suites. Final PR evidence must cover the resulting change and current required CI. Distinguish tests run locally, reported results, CI and missing checks.

Use isolated fixtures and the separate test database, never development data for destructive tests. Run persistence and browser suites sequentially. Commands and prerequisites are in [README verification](README.md#verification).

## Git and PRs

- Feature branches, commits and pushes are authorised. Do not push feature work directly to main or merge a PR without the user's approval. Inspect staged changes for unrelated work and secrets; keep commits focused.
- Complete the applicable independent review before opening a PR. Describe resulting behaviour, verification and remaining risks. Publish a review comment following the review skill before handoff; this workflow authorises those comments and follow-ups, not merging.
- Finish with a merge recommendation: ready for the user's approval, return to development, or wait for verification. Identify blockers and the next action.
- Install and use the [staged commit checks](README.md#commit-checks). Preserve custom hooks, fix and stage violations, and do not bypass failing checks.
