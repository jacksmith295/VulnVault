# Working on VulnVault

## Product and current scope

VulnVault is a web application, initially self-hosted, for tracking vulnerabilities across services. A service may have multiple repositories. Findings will support manual entry, external ingestion, assignment, remediation, and rejection of false positives. Dependabot and public CVE sources are intended integrations; other repository providers must remain possible.

Development is local for now. Use the existing Next.js application and local PostgreSQL. Deployment is deferred until a useful MVP exists. See [the MVP plan](docs/mvp-plan.md) for milestones and unresolved decisions.

## Collaboration

- Discuss a concrete implementation plan before coding a feature. Explain scope, intended behaviour, important design choices, verification, and unresolved questions.
- After agreement, implement the full agreed scope autonomously. Choose routine implementation details independently.
- Discuss system architecture, data design, and material changes to agreed behaviour with the user before implementing them. Do useful independent work while awaiting answers.
- Prefer sensible, extensible structures. Avoid speculative abstractions or enterprise infrastructure without a demonstrated need.
- The user is learning frontend, backend, DevOps, and effective AI-assisted engineering. Explain key choices in the plan and final writeup.
- Finish with what changed, why, verification results, and material limitations or follow-up decisions. Distinguish completed work from proposals.
- Keep [the MVP roadmap](docs/mvp-plan.md) current when delivered scope, milestone status, or agreed priorities change; reconcile merged work before starting the next slice. Distinguish planned, implemented, and merged work. Keep concrete next steps and unresolved decisions short, linking detailed designs and verification instead of accumulating history.
- Use plain language and avoid em dashes in authored prose and comments.

## Parallel implementation and review

- Use parallel agents regularly for bounded work, research, and independent review.
- Feature work should have an implementation agent and a separate review agent. The coordinating agent may implement a portion, but must obtain an independent review.
- Review both design decisions and completed changes. Reviewers should examine correctness, security, permissions, data integrity, maintainability, scope, and missing verification as applicable.
- Give agents clear ownership of files or components to avoid conflicting edits. Share relevant context and acceptance criteria.
- Address review findings, verify fixes, and request another review when substantive changes warrant it. Report unresolved concerns explicitly.
- Agent review supports the user's PR review; it does not authorise merging to main.

## Model selection and reasoning effort

- Choose a suitable model and explicitly select low or medium reasoning effort wherever the available tooling allows it, including for implementation and review agents. Do not inherit an unknown or higher effort setting silently.
- Prefer low reasoning for routine, clearly bounded work such as straightforward documentation edits, simple searches, and mechanical changes. Use medium for implementation, debugging, design analysis, and substantive review when the task warrants it.
- Any reasoning effort above medium requires the user's explicit approval before use. Explain the task, proposed model and effort, and why escalation would help. Approval applies only to the stated scope; task complexity or a review failure does not imply approval.
- Model choice and reasoning effort are separate decisions. A model switch must not bypass the effort approval rule. Continue useful work at low or medium while an optional escalation is pending.
- If the current session's model or reasoning effort cannot be changed through available tools, state that limitation rather than claiming to have changed it. Do not edit user-wide configuration to enforce repository preferences without permission.

## Code and architecture

- Retain the existing Next.js App Router, TypeScript, Tailwind, and component conventions unless a different direction is agreed.
- Server Actions and Route Handlers are available within the initial application. Decide their responsibilities in the implementation plan rather than introducing a separate backend by default.
- Write readable code with clear names and focused responsibilities. Comments should explain intent, constraints, or non-obvious behaviour, rather than narrating obvious code.
- Keep authentication independent of GitHub or any other repository integration. Optional provider login can be added later.
- Keep credentials and integration secrets on the server. Validate untrusted input and enforce permissions at server entry points.
- Use workspaces as the shared ownership model from the start. Users may create a workspace or join an existing one by invitation. A workspace creator becomes its owner; registration alone creates neither a workspace nor membership.
- Solo developers use a workspace with one member. Do not introduce separate personal and company account types. Users may belong to multiple workspaces. Services, findings, and integrations belong to a workspace.
- Enforce workspace membership and permissions on the server. Registration must not grant access to other users' or workspaces' private data. Owners control ownership and destructive settings; admins manage routine workspace settings and members; members can view services they can access through groups. Each workspace has an implicit all-member default group; services use it unless specific groups are assigned. Membership in any assigned group grants access. Owners/admins initially retain access to all services and manage groups and service access. Service creation, edits, archive, and restore require owner or admin membership. All known workspace roles, including members, may create and update findings within services they can access. No role may delete findings. Findings in archived services are read-only until an owner/admin restores the service. Each finding belongs to one service and has an independent resolution lifecycle. Default access broadening requires explicit confirmation. Group deletion is deferred. Detailed invitation behaviour requires a design discussion.
- Workspace-sensitive mutations acquire the workspace permission lock before membership, service, and finding locks, following [the current permission protocol](docs/service-access-groups-plan.md#authorisation-and-concurrency). Re-read permissions after locking.
- Never log secrets, passwords, session tokens, or sensitive vulnerability evidence.
- Discuss schema changes, migration strategy, and data ownership before implementation. Do not silently reset databases or discard data.
- Preserve existing user changes. Do not revert unrelated edits or include them in commits without permission.

## UI components and theme

- Pages and feature components should return reusable TSX components rather than raw HTML such as `div`, `p`, native form controls, or independently styled links. Keep semantic HTML in shared UI and layout component definitions.
- ESLint enforces component-based JSX and central styling in routes and features, for both JSX and TSX files. The root document layout is exempt for its required HTML/body structure. Add a shared component or variant when the rule flags a new presentation need.
- Build interactive controls on the installed Base UI primitives. Reuse styled wrappers from `components/ui` rather than adding feature-specific native controls or custom interaction listeners.
- Keep Tailwind classes in shared component definitions. Expose typed variants for recurring differences; avoid cosmetic `className` overrides in pages and features.
- Theme values belong in global semantic tokens. Maintain the green application identity consistently in light and dark modes, with a persisted system/light/dark preference.
- Use shared page, typography, form, feedback, list, and empty-state components. Keep domain presentation in feature components and authorised data loading in server routes.
- Preserve semantic landmarks, heading levels, labels, accessible errors, valid links/buttons, and keyboard interaction through composition.
- Theme and presentation changes must preserve form state, validation, action payloads, and original service edit versions. Keep theme-independent component identity stable.

## Verification

- Run linting and TypeScript checks for relevant application changes, plus a production build when appropriate.
- Add meaningful tests for business rules, permissions, data behaviour, and important failure paths. Avoid tests that merely mirror implementation details.
- Check important user flows in a browser when tooling is available. Otherwise state the limitation and provide concrete manual checks.
- Exercise authentication and authorisation failure paths, not just successful requests.
- Use isolated test data and a separate test database when persistence tests require one. Never run destructive tests against development data.
- Report exactly which checks passed, failed, or could not run. Do not claim verification that was not performed.

Current frontend commands, run from the repository root:

```sh
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Tests require the separate Compose test database and `TEST_DATABASE_URL`. Browser tests also require a production build, Mailpit, and Playwright Chromium. See the root README for setup. Run integration and browser suites sequentially. Update these instructions when commands change.

## Git and PRs

- Feature branches, commits, and pushes are authorised. Keep commits focused and inspect staged changes to exclude unrelated work and secrets.
- Do not push feature work directly to main. Do not merge PRs without the user's approval.
- Before opening a PR, review the changes independently and address findings. Include a concise description of resulting behaviour, validation evidence, and remaining risks.
- Leave the PR ready for the user's review. Summarise substantive agent review findings and their resolution.
- Install the repository pre-commit hook with `npm run hooks:install` (also run by npm `prepare`). It checks staged route/feature JSX and TSX against ESLint, including the native HTML and styling restrictions. Preserve existing custom hooks if installation reports a conflict.
- Use `npm run hooks:check` to inspect the staged index and `npm run test:hooks` for isolated hook regression tests. Fix and stage violations before committing; do not bypass the hook to get a failing commit through.

## Local environment

- Run Next.js directly on the host. Manage PostgreSQL and a local email inbox through Docker Compose once implemented.
- Email/password authentication and password reset are the agreed initial direction. Use the local inbox for development email.
- Require email verification. Use seven-day sessions refreshed with activity, and revoke existing sessions after password reset.
- Preserve the credential transaction guard and explicit local authentication rate-limit policy. Better Auth upgrades and new credential endpoints require review of [the hardening integration](docs/auth-hardening.md) and its PostgreSQL concurrency/rollback regressions. Never trust arbitrary forwarded IP headers or disable throttling for test convenience.
- Document setup and provide safe example configuration when introducing infrastructure. Keep real secrets out of version control.
- Do not deploy or provision cloud infrastructure as part of local MVP work.
