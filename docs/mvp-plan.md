# VulnVault MVP plan

## Purpose

Build a dedicated vulnerability tracking application for the owner's other projects, while learning efficient AI-assisted engineering. Deliver useful, small increments, discussing each implementation plan before work begins.

The application is initially self-hosted locally. Public hosting, cloud infrastructure, and commercial enterprise capabilities are future decisions.

## Agreed direction

- Keep the existing Next.js frontend. Start with application backend responsibilities inside Next.js; discuss concrete Server Action and Route Handler boundaries per feature.
- Use local PostgreSQL, managed through Docker Compose. Run Next.js on the host and capture development email in a local inbox.
- Begin with email/password accounts, login, logout, protected access, and password reset. Repository provider login is optional future work.
- Anyone who can reach the application can register. Account registration and workspace access are separate concerns.
- Use workspaces from the start, for both solo developers and teams. A user can create a workspace and become its owner, or join an existing workspace by invitation. Registration alone creates neither a workspace nor membership.
- Users may belong to multiple workspaces. Services, findings, and integrations belong to a workspace. A solo developer uses a workspace with one member; there are no separate personal and company account types. Detailed roles and invitation mechanics still need agreement.
- A service may link multiple repositories; whether any are required remains to be decided. Keep repository provider identity separate from user authentication.
- Eventually support manually entered and automatically imported findings, a board, assignment, remediation, and rejected findings.
- Initial external sources of interest are Dependabot and public CVE feeds. GitLab, Bitbucket, and other sources must remain possible later.

## Current repository

Authentication and workspace onboarding are merged, including local infrastructure, shared app header, workspace selector, integration tests, and browser tests. Service management is merged. The UI foundation and staged UI pre-commit hook are merged. Manual findings are implemented on their feature branch for review.

At initialisation, the login form and login schema contained user changes. Preserve these when implementing subsequent work.

## Incremental delivery

These are planning slices, not approval to implement every slice. Agree on design and acceptance criteria before each one. Revisit scope as practical use reveals needs.

### 1. Local foundation and authentication

Design account identity and authentication before implementing their schema. Include users, workspaces, and memberships in the initial data design. Define workspace creation and onboarding boundaries before implementation. Select and verify maintained authentication tooling rather than designing password/session cryptography from scratch.

Set up PostgreSQL, development email, configuration examples, migrations, and test infrastructure needed for this slice. Connect registration and login to real persistence, add logout and protected access, and implement password reset.

Acceptance targets:

- A developer can follow documented steps to start the app and supporting services locally.
- A visitor can register, log in, access a protected landing page, and log out.
- Invalid requests fail safely; signed-out users cannot access protected data or actions.
- Password reset works through the development inbox, with expiring, single-use reset credentials.
- Registration alone cannot expose another user's or workspace's private data.
- Meaningful tests cover account and session behaviour, reset failures, and relevant permission boundaries.
- Lint, type checks, applicable build checks, and independent review are complete.

Selected for this slice: Better Auth, its organisation plugin, Drizzle, PostgreSQL, and Mailpit. Required email verification and seven-day sessions refreshed with activity are agreed, with reset revoking existing sessions. Workspace UI and invitations follow separately. See the detailed design for policies and schema boundaries.

### 2. Workspace context and first service

Implement workspace creation and selection before service creation. Use a persistent header with a top-left workspace dropdown, including Create workspace + and All workspaces links. Default to an accessible remembered workspace after login; explicit URLs retain independent context in each tab. See the [workspace onboarding plan](workspace-onboarding-plan.md). A registered user can create a workspace and become its owner. Agree on who can manage services and how invitations are issued and accepted. Invitation and member-management UI can be a separate slice if not needed for the single-user workflow; joining existing workspaces by invitation remains the agreed direction.

Acceptance targets:

- An authorised user can create, view, and edit a service in their workspace.
- Service access is enforced on the server and isolated across workspaces, including for users with multiple memberships.
- A service supports multiple repository associations in the agreed design. Decide whether the UI initially records repository references or performs an authenticated provider connection.
- Required service fields and deletion/archive behaviour are agreed before implementation.

### 3. Manual findings and workflow

The user agreed on one service per finding, title, description, severity, optional reference URLs, and optional remediation notes. Members can create and update findings. No role can delete findings, and findings in archived services are read-only until restoration. See the [manual findings plan](manual-findings-plan.md) for the approved schema and lifecycle. The list/detail/edit slice precedes the board and assignment.

The initial statuses are New, Triaged, In progress, Resolved, Rejected, and Accepted risk. Any status may transition to another, including reopening. Assignment, rejection reasons, and board interaction remain separate design decisions.

Acceptance targets:

- An authorised user can record a finding against a service and track it through the agreed workflow.
- The board and finding detail show consistent persisted state.
- Invalid transitions and unauthorised changes are rejected.
- Sensitive details remain isolated to authorised users.

### 4. First automatic ingestion

Start by discussing a Dependabot integration. Decide provider permissions, how repositories connect, ingestion transport, retries, deduplication, and how upstream changes interact with local triage.

Acceptance targets:

- A connected repository can supply real alerts to the appropriate service.
- Repeated delivery does not create duplicate findings.
- Ingestion failures are visible and recoverable.
- Integration credentials stay server-side and access remains workspace-scoped.
- Imported findings retain source identity and useful provenance.

### 5. CVE relevance and useful local MVP

Select feeds and decide how VulnVault knows a service's affected components and versions. A CVE feed alone cannot reliably identify which services are vulnerable. Inventory, matching, update handling, and noise control need their own design.

Assess the end-to-end workflow using real projects, then agree on MVP completion criteria. Review backup/restore, upgrade steps, observability, and security issues appropriate to local use. Decide whether CVE matching is required for that first useful MVP or a later release.

## Deferred scope

Public deployment, cloud scaling, separate ingestion infrastructure, enterprise SSO, billing, advanced role systems, and additional providers are not initial requirements. Add infrastructure when observed needs justify it.

## Next design discussion

Services, the [UI foundation](ui-foundation-plan.md), and the staged UI pre-commit hook are merged. The [manual findings plan](manual-findings-plan.md) is approved and implemented for PR review. Board/assignment and invitation/membership management remain separate slices.

Use a separate implementation agent and review agent. Review the proposed design as well as the resulting code. Feature branches and pushes are authorised; PRs remain for the user's review and approval before merging.
