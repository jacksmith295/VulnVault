# Workspace onboarding

Status: implemented for PR 2, including the user-requested persistent workspace selector and default workspace entry. Awaiting PR review and merge.

## User experience

- After login, `/dashboard` opens the remembered accessible workspace, falling back to the first accessible workspace in stable order. With none, show onboarding and a Create workspace button. `/workspaces` provides an explicit All workspaces list.
- `/workspaces/new` asks for a display name and URL slug. Suggest a slug from the name and let the user edit it before creation. Names may repeat; slugs must be unique across the installation.
- Proposed validation: trimmed display name of 2 to 100 characters; slug of 3 to 63 lowercase ASCII letters/digits separated by single hyphens, with no leading/trailing hyphen. Show a useful collision error without discarding the form.
- Creation makes the signed-in user the owner and opens `/w/[workspaceSlug]`.
- Use a persistent header with the workspace dropdown in the top left. It lists memberships, indicates the current workspace, and has Create workspace + and All workspaces links at the bottom. The workspace page shows its name, the user's role, and an honest empty state for services. Include logout.
- Workspace selection is explicit navigation. The URL identifies the workspace for each tab; do not use session active-organisation state or browser storage as authority. Remember explicit selection and creation in a browser cookie as a navigation hint only; check current membership before using it. The preference must never override explicit URLs or grant access. A stale preference falls back safely. Direct workspace URLs remain independently usable in separate tabs.
- Invitations, settings edits, deletion, ownership transfer, member management, and services follow in later slices. Do not show nonfunctional controls for them.

## Server and data design

Use the existing organisation and membership tables, exposed as workspaces in application code and UI. No new schema or migration is expected.

Create a small workspace feature with shared validation schemas, server-only data access, a Server Action for creation, and focused UI components. Reads use Server Components. Continue to use the existing session monitor and verified-session helper.

The installed Better Auth 1.7.16 organisation creation handler performs organisation and owner-member creation separately. `transaction: true` on its adapter supplies transaction support, but does not wrap the complete handler. The handler also changes session active-organisation state by default. These behaviours were checked in `node_modules/better-auth/dist/plugins/organization/routes/crud-org.mjs`.

For this slice, create both records using an explicit Drizzle transaction in a server-only workspace function, invoked by the Server Action. Generate compatible opaque text IDs, derive the user identity from the verified session, and insert the owner membership with its fixed role. Do not accept creator IDs, roles, logos, metadata, or initial members from the browser. The same tables remain the membership source of truth for future plugin-backed invitations. No custom credential handling is introduced.

Keep all plugin organisation endpoints blocked during this slice. Workspace reads query the existing tables directly, joining against the current user's membership and projecting only necessary fields. Enabling future plugin endpoints requires a separate permission review.

Creation must:

- Validate input on the server, independently of browser validation.
- Commit workspace and owner membership together, or roll both back on failure.
- Rely on the database unique slug constraint to settle concurrent collisions. Convert that specific conflict into a useful form error; handle other failures without exposing database details.
- Apply a database-backed per-user creation request limit, proposed as five attempts per minute, so Server Action calls do not bypass throttling. Use a separate namespaced key from authentication limits and ensure concurrent requests cannot evade the count.
- Return only workspace fields required for navigation. Retry after an interrupted response may produce a slug-conflict error; the workspace list provides recovery. Exactly-once creation is outside this slice.

Membership checks must:

- Require a signed-in, verified user before reading protected workspace data.
- Resolve slug and current user's membership together. Missing workspaces and workspaces inaccessible to that user produce the same not-found experience.
- Read membership on every protected operation, avoiding cross-request permission caching. Removal must revoke access even when the session remains valid.
- Provide a shared role-aware guard for later mutations, with unknown roles denied. This slice exposes no role-changing operations.
- Keep requests from separate tabs independent. A future mutation must receive explicit workspace context and verify membership for that context.

## Verification and review

Integration tests against the isolated PostgreSQL database cover creation and owner role, rollback when membership creation fails, duplicate and concurrent slug attempts, server validation, throttling, unverified/signed-out requests, blocked plugin endpoints, and membership-scoped reads. Include members and admins using controlled fixtures.

Browser tests cover first workspace creation, the chooser and switcher, multiple workspaces in separate tabs, direct non-member denial, membership revocation with a live session, validation/collision recovery, and logout. Authentication and session-refresh regression tests continue to pass.

Run lint, type checks, the integration suite, a production build, and browser tests. Use medium reasoning for substantive implementation and independent review agents; low is sufficient for routine supporting edits. Anything above medium requires explicit user approval.

The implementation agent and separate review agent inspect transaction handling, permission enforcement, and test evidence before a PR is opened for the user's approval.
