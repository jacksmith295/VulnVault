# Authentication and workspace foundation

Status: the user agreed the workspace model, owner/admin/member responsibilities, required email verification, and seven-day sessions refreshed with activity and revoked after password reset. Implementation is proceeding with PR 1 below. Workspace onboarding and invitations remain later implementation slices; their detailed behaviour needs discussion.

## Outcome

A user registers, verifies their email using the development inbox, and signs in. They can create a workspace or follow an invitation to join one. A solo developer follows the same flow and owns a workspace with one member. A user with multiple memberships can select a workspace. Users without membership see onboarding rather than workspace data.

## Selected tooling for the first slice

| Responsibility | Choice | Reason |
| --- | --- | --- |
| Authentication | Better Auth | Integrates with Next.js and provides email/password and session handling. |
| Workspace membership | Better Auth organisation plugin, called workspaces in the UI | Reuses membership and invitation infrastructure rather than creating a second identity system. |
| Database access | Drizzle ORM with PostgreSQL | TypeScript schemas and queries while keeping SQL concepts visible for learning. |
| Schema changes | Drizzle Kit generated SQL migrations | Review and commit migrations, then apply them explicitly. Avoid routine schema push or database resets. |
| Development email | Mailpit with SMTP delivery | Inspect verification, reset, and invitation emails locally. |
| Tests | Vitest for relevant logic/integration tests; Playwright for key browser flows | Exercise real auth and access boundaries, rather than mocking away the behaviour being verified. |

Better Auth documents [Next.js integration](https://better-auth.com/docs/integrations/next), [email/password support](https://better-auth.com/docs/authentication/email-password), an [organisation plugin](https://better-auth.com/docs/plugins/organization), and a [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle). The plugin supplies the membership foundation; application-specific service and finding permissions remain our responsibility.

Drizzle Kit supports [generating and applying SQL migrations](https://orm.drizzle.team/docs/kit-overview). Mailpit supplies an [official Docker image and local SMTP/UI interfaces](https://mailpit.axllent.org/docs/install/docker/).

These choices keep auth and persistence in the existing application. A separate identity service or backend would add operational work without a current requirement. Drizzle is used for this slice; reconsidering the persistence layer would require a new design discussion.

The implementation pins newly selected dependencies and commits the application lockfile. Verify compatible versions and security advisories when updating dependencies. Generate library schema against the configured version and review it alongside application constraints. The application uses Node.js 24 LTS.

## Data ownership

| Concept | Purpose and boundaries |
| --- | --- |
| User | Global account identity, display name, unique normalised email, verification state, timestamps. |
| Account | Library-managed credentials/provider identity linked to a user. Password hashes belong here according to the selected library schema, not in a second custom password table. |
| Session | Library-managed server-side session linked to a user, with expiry and revocation. Workspace selection is not proof of permission. |
| Verification | Library-managed lifecycle for email verification and password recovery. Verify storage and expiry behaviour for the pinned version. |
| Workspace | Library organisation record: immutable identity, display name, unique slug, timestamps. UI and domain terminology use workspace; retain library schema conventions where practical. |
| Membership | Links a user and workspace with a role. Enforce one membership per user/workspace pair with a database constraint. |
| Invitation | Workspace, recipient email, intended role, inviter, status, and expiry. Persist the library schema and verify acceptance semantics before building UI. |

Generate the library's required tables and review foreign keys, uniqueness, indexes, and deletion behaviour. Add necessary constraints through migrations without maintaining a competing membership or authentication system. Agree on actual columns and constraints before schema implementation.

Services will reference workspace identity, independent of any member's account. Findings and integrations will be workspace-owned; later designs must prevent cross-workspace references, including when an attacker supplies a valid resource ID from another workspace. Those domain tables are outside this implementation slice.

## Agreed role responsibilities and initial access boundaries

- Owner: workspace settings, invitations, membership administration, and future service/finding management. Workspace creator receives this role.
- Admin: routine workspace and member administration, without granting ownership, changing owners, or deleting the workspace.
- Member: normal service/finding work, without member or workspace administration.
- All authenticated, verified users may create a workspace. Workspace names need not identify a registered company.
- No instance-wide administrator is needed for the first slice.
- Ownership transfer, workspace deletion, account deletion, and leaving/removing the last owner are deferred UI features. Direct library endpoints must still enforce the intended policy; hiding controls is insufficient.

Role responsibilities are agreed, but plugin defaults still require review before workspace operations are enabled. Review and configure server-side plugin permissions and hooks, including endpoints without UI. Prevent loss of the last owner. Add explicit tests for role escalation and membership removal. Future service/finding permissions need agreement when those features are designed.

## Authentication and email policy

Email verification and session behaviour are agreed. Other lifetimes below are implementation defaults:

- Require email verification before normal sign-in, workspace creation, or invitation acceptance. Keep the local flow realistic by verifying through Mailpit rather than adding a bypass.
- Use library-managed password hashing and opaque database sessions. Do not store bearer credentials in browser local storage.
- Start with a seven-day session lifetime refreshed after one day of activity. Avoid cookie session caching initially so revocation does not depend on a stale cached session.
- Password reset links expire after one hour, are single-use, and revoke existing sessions when reset succeeds. Reset completion returns the user to login.
- Verification links expire after 24 hours; invitations after seven days. Confirm each lifetime is configurable in the chosen version before promising it.
- Use generic login/reset responses where appropriate, and bounded auth/email request rates. Test that throttling is active in the local environment rather than relying on production-only defaults.
- Restrict callback destinations and trusted origins. Bind local database and inbox ports to loopback. Keep development credentials separate from future hosting configuration.
- Invitation acceptance requires a signed-in user with the verified recipient email. Possessing a forwarded link or sharing an email domain grants no membership. Accepting twice must not create duplicate memberships; expired, cancelled, and wrong-recipient invitations must fail safely.

The first slice retains passwords of 8 to 128 characters. Workspace administration and invitation operations remain disabled until their implementation slices; the underlying tables are present.

## Next.js responsibilities

- Mount the auth library's handler at `/api/auth/[...all]`. Use its client for credential and session operations; avoid a second set of custom authentication endpoints.
- Use Server Components for initial protected reads and Server Actions for application mutations such as future service changes. Keep Route Handlers for the auth integration and future external callbacks/webhooks.
- Centralise server-side session, membership, and permission checks in a small data-access layer. Every action and handler must enforce its own access requirements. Layout redirects and hidden buttons are user experience conveniences.
- Use explicit workspace context in routes, proposed as `/w/[workspaceSlug]`. Resolve the slug to an ID and check membership on the server. Another tab changing its selected workspace must not redirect a mutation to a different tenant.
- Query workspace resources with both workspace and resource identity. Avoid shared caches of user-specific or workspace-specific results.
- Preserve the existing component style and user edits. Replace current credential `console.log` stubs when connecting the forms. Include loading states, clear errors, accessible controls, and functioning password visibility buttons.

This follows the Next.js guidance to put [authorisation checks close to data access](https://nextjs.org/docs/app/guides/authentication), including within exposed server operations.

## Proposed delivery and acceptance

### PR 1: Local infrastructure and working authentication

Agree on and migrate the full auth/workspace foundation schema, but deliver authentication UI first. Add Compose PostgreSQL and Mailpit, configuration examples, migration commands, a committed lockfile, and setup documentation.

Connect registration, verification/resend, login, logout, password reset, and a protected account landing page. Registration creates no workspace. Users without workspaces see an honest onboarding placeholder until PR 2.

Verify migrations against an empty isolated database, credential validation, session expiry/revocation, reset replay and expiry, verification, signed-out access, and relevant error/rate-limit paths. Run browser checks for the complete account flow using Mailpit, plus lint, type checks, and build. Review generated SQL and all exposed plugin operations.

### PR 2: Workspace onboarding and access

Add workspace creation, list/selection, a protected workspace landing page, and role-aware access helpers. Creation establishes the creator's owner membership atomically; failure must not leave an ownerless workspace. Do not add services yet.

Verify creation, slug collision handling, multiple memberships, direct access denial for non-members, membership revocation, and correct workspace targeting across tabs. Where member-management UI is absent, create test memberships through controlled fixtures rather than weakening production access checks.

### PR 3: Invitations and minimal membership management

Add owner/admin invitations and a member list, plus accept/reject flows for new and existing accounts. Carry invitation context through signup and verification with validated local return paths. Do not force invitees to create a workspace.

Verify recipient identity, expiry, cancellation, duplicate acceptance, disallowed roles, role changes/removal, and last-owner protection. Define the exact member-management scope before this PR.

Use a separate implementation agent and independent reviewer for each PR. Review the design before implementation and review code, migrations, tests, and resolved findings before opening a PR for the user's approval. Keep test data isolated from the development database. Deployment remains out of scope.
