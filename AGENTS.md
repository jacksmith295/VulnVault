# Working on VulnVault

## Product and scope

VulnVault tracks vulnerabilities across services. A service can have multiple repositories. Findings will support manual entry, external ingestion, assignment, remediation, and rejection of false positives. Dependabot and public CVE sources are intended integrations. Keep support for other repository providers possible.

Development is local. Use the existing Next.js application and local PostgreSQL. The initial product is self-hosted. Deployment is deferred until a useful MVP exists. Do not deploy or provision cloud infrastructure during local MVP work. See [the MVP plan](docs/mvp-plan.md) for milestones and unresolved decisions.

## Collaboration

- Before coding a feature, discuss a concrete implementation plan. Cover scope, intended behaviour, important design choices, verification, and unresolved questions.
- After agreement, implement the full agreed scope autonomously. Choose routine implementation details independently.
- Discuss system architecture, data design, and material changes to agreed behaviour with the user before implementing them. Continue useful independent work while awaiting answers.
- Use extensible structures that meet demonstrated needs. Avoid speculative abstractions or enterprise infrastructure without a demonstrated need.
- The user is learning frontend, backend, DevOps, and AI-assisted engineering. Explain key choices in the plan and final writeup.
- Finish with what changed, why it changed, verification results, and material limitations or follow-up decisions. Distinguish completed work from proposals.
- Keep [the MVP roadmap](docs/mvp-plan.md) current when delivered scope, milestone status, or agreed priorities change; reconcile merged work before starting the next slice. Distinguish planned, implemented, and merged work. Keep concrete next steps and unresolved decisions short, linking detailed designs and verification instead of accumulating history.
- Use plain language and direct sentences with explicit conditions and consistent terms. Preserve technical context and exceptions. Avoid em dashes in authored prose and comments.
- Preserve existing user changes. Do not revert unrelated edits or include them in commits without permission.

## Skills

Use the relevant skill when a task matches its scope:

| Task | Required skill |
| --- | --- |
| Pages, forms, shared components, styling, or themes | [UI and styling](.agents/skills/ui-styling/SKILL.md) |
| Queries, schema, migrations, or transactions | [Database work](.agents/skills/database-work/SKILL.md) |
| Feature plan, implementation, or PR review | [Review](.agents/skills/review/SKILL.md) |

Keep shared repository rules in `AGENTS.md`. Keep focused, recurring workflows in `.agents/skills/<skill-name>/SKILL.md`. Link to existing documentation instead of duplicating it.

Use lowercase letters, digits, and hyphens in skill names. Start each `SKILL.md` with YAML frontmatter containing `name` and a `description` that states when the skill applies. Add `scripts/`, `references/`, `assets/`, or `agents/openai.yaml` only when the workflow needs them.

## Parallel work and independent review

- Use parallel agents regularly for bounded implementation, research, and independent review.
- Feature work should have an implementation agent and a separate review agent. The coordinating agent may implement a portion. Obtain independent review of both the design and completed changes using the review skill.
- Give agents clear ownership of files or components. Share the relevant context and acceptance criteria. Avoid conflicting edits.
- Address review findings, verify fixes, and request another review when substantive changes warrant it. Report unresolved concerns explicitly.

## Models and reasoning effort

- Choose the model and reasoning effort separately. Explicitly select low or medium effort wherever the tools permit, including for implementation and review agents. Do not silently inherit an unknown or higher setting.
- Prefer low effort for routine, clearly bounded work such as documentation edits, simple searches, and mechanical changes. Use medium for implementation, debugging, design analysis, and substantive review when the task warrants it.
- Obtain the user's explicit approval before using effort above medium. Explain the task, proposed model and effort, and why escalation would help. Approval applies only to that scope.
- Task complexity, a review failure, or a model switch does not authorise higher effort. Continue useful work at low or medium while optional escalation is pending.
- If the tools cannot change the current session's model or effort, state that limitation. Do not claim to have changed it. Do not edit user-wide configuration without permission.

## Application architecture

- Retain Next.js App Router, TypeScript, Tailwind, and existing component conventions unless a different direction is agreed.
- Use the implementation plan to assign responsibilities to Server Actions and Route Handlers. Do not introduce a separate backend by default.
- Use clear names and focused responsibilities. Comments should explain intent, constraints, or non-obvious behaviour. Do not narrate obvious code.
- Keep authentication independent of repository integrations. Optional provider login can be added later.
- Keep credentials and integration secrets on the server. Validate untrusted input and enforce permissions at server entry points.
- Never log secrets, passwords, session tokens, or sensitive vulnerability evidence.

## Workspace ownership and permissions

### Ownership

- Use workspaces as the shared ownership model. A solo developer uses a workspace with one member. Do not create separate personal and company account types.
- A user can belong to multiple workspaces. Services, findings, and integrations belong to a workspace.
- A user can create a workspace or join by invitation. The creator becomes its owner. Registration alone creates neither a workspace nor membership and grants no access to private data.
- Discuss detailed invitation behaviour before implementing it.

### Access and administration

- Enforce workspace membership and permissions on the server.
- Owners control ownership and destructive settings. Admins manage routine workspace settings and members.
- Each workspace has an implicit all-member default group. A service uses that group unless specific groups are assigned. Membership in any assigned group grants service access.
- Members can view services their groups grant access to. Owners and admins initially retain access to every service and manage groups and service access.
- Service creation, edits, archive, and restore require owner or admin membership.
- Require explicit confirmation before broadening service access back to the default group. Group deletion is deferred.

### Findings

- Every known workspace role, including members, can create and update findings in accessible services.
- No role can delete findings.
- Each finding belongs to one service and has an independent resolution lifecycle.
- Findings in archived services are read-only. An owner or admin must restore the service before findings can change.

### Database changes and concurrency

- Discuss schema changes, migration strategy, and data ownership before implementation. Do not silently reset databases or discard data.
- Workspace-sensitive mutations must acquire the workspace permission lock before membership, service, and finding locks. Re-read membership and permissions after locking. Follow [the permission protocol](docs/service-access-groups-plan.md#authorisation-and-concurrency) and the database-work skill.

## UI boundaries

- Follow the UI and styling skill for component composition, Base UI controls, semantic HTML, theme tokens, accessibility, and form-state preservation.
- Keep semantic HTML and Tailwind classes in shared UI and layout definitions. Pages and features compose reusable components. Reuse shared page, typography, form, feedback, list, and empty-state components.
- ESLint enforces component composition and central styling in route and feature JSX and TSX files. The root document layout is exempt for its required `html` and `body` structure. Add a shared component or variant when a new presentation need triggers the rule.

## Verification

- Run lint and TypeScript checks for relevant application changes. Run a production build when appropriate.
- Add meaningful tests for business rules, permissions, data behaviour, and important failure paths. Include authentication and authorisation failures. Avoid tests that only mirror the implementation.
- Check important user flows in a browser when tools are available. If browser checks cannot run, state the limitation and give concrete manual checks.
- Use isolated test data and the separate test database for persistence tests. Never run destructive tests against development data.
- Report which checks passed, failed, or could not run. Do not claim checks that were not performed.

Run application commands from the repository root:

```sh
npm run dev
npm run lint
npm run typecheck
npm run test:startup
npm test
npm run build
npm run test:e2e
```

Tests require the separate Compose test database and `TEST_DATABASE_URL`. Browser tests also require a production build, Mailpit, and Playwright Chromium. See the [README](README.md#verification) for setup. Run integration and browser suites sequentially. Update these instructions when commands change.

## Git and PRs

- Feature branches, commits, and pushes are authorised. Do not push feature work directly to main. Do not merge PRs without the user's approval.
- Keep commits focused. Inspect staged changes to exclude unrelated work and secrets.
- Before opening a PR, complete independent review using the review skill. Describe the resulting behaviour, validation evidence, and remaining risks.
- After creating a PR, obtain a separate review of the published PR using the review skill. Post review comments on GitHub before handing the PR to the user. This workflow authorises those review submissions. It does not authorise merging.
- Finish the PR handoff with a merge recommendation. State whether it is ready for the user's merge approval, must return to development, or must wait for verification. Identify blockers and the next required action.
- Install the pre-commit hook with `npm run hooks:install`, which also runs through npm `prepare`. If installation reports a conflict, preserve the existing custom hook.
- The hook checks staged route and feature JSX and TSX against ESLint, including native HTML and styling restrictions. Use `npm run hooks:check` to inspect the staged index. Use `npm run test:hooks` for isolated hook regression tests.
- Fix and stage violations before committing. Do not bypass the hook to commit failing changes.

## Local environment and authentication

- Run Next.js directly on the host for normal development. Manage PostgreSQL and the local email inbox through Docker Compose. Optional PC-local Docker hosting for trusted Wi-Fi or private Tailscale access follows [the local hosting guide](docs/local-hosting.md); it does not authorise public or cloud deployment.
- Use email/password authentication and password reset. Require email verification. Use the local inbox for development email.
- Use seven-day sessions refreshed with activity. Revoke existing sessions after password reset.
- Preserve the credential transaction guard and explicit local authentication rate-limit policy. Before a Better Auth upgrade or a new credential endpoint, review [the hardening integration](docs/auth-hardening.md) and its PostgreSQL concurrency and rollback regressions.
- Never trust arbitrary forwarded IP headers. Do not disable throttling for test convenience.
- Document setup and provide safe example configuration when introducing infrastructure. Keep real secrets out of version control.
