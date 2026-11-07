# Authentication and workspace foundation

Authentication and workspace onboarding are implemented. Invitations and membership administration remain deferred. Current service permissions and locking follow the [service access reference](service-access-groups-plan.md).

## Tooling and ownership

Better Auth supplies email/password authentication, opaque database sessions, and organisation tables exposed as workspaces. Drizzle manages PostgreSQL queries and reviewed SQL migrations. Mailpit receives local email. Authentication remains independent of repository integrations; application service and finding permissions are enforced by the application.

| Record | Boundary |
| --- | --- |
| User | Global identity, unique normalised email and verification state. |
| Account | Library-managed credentials and password hashes, without a competing password table. |
| Session | Server-side expiry and revocation; workspace selection is never permission evidence. |
| Verification | Library-managed verification and password-recovery lifecycle. |
| Workspace | Organisation identity, display name and installation-unique slug. |
| Membership | User/workspace link and role, unique per pair. |
| Invitation | Library schema is present, but invitation operations and UI are disabled. |

Registration creates neither a workspace nor membership. A verified user can create a workspace, becoming its owner atomically. Solo users use this same model. Services and integrations belong to workspaces; findings belong to services. Cross-workspace references must fail even when a supplied resource ID exists elsewhere.

## Roles and server boundaries

Owners control ownership and destructive settings; admins manage routine settings and members when those operations are enabled. Members perform finding work within accessible services. Unknown roles fail closed. Current service and group permissions are defined in the [service access reference](service-access-groups-plan.md).

Workspace creation uses an explicit application transaction, not the organisation plugin creation endpoint. Plugin organisation endpoints remain blocked, including direct calls without UI. Ownership transfer, workspace/account deletion, leaving, member removal and invitations are not exposed. Future membership operations must prevent loss of the last owner and follow the workspace permission-lock protocol.

The auth handler is `/api/auth/[...all]`. Server Components perform protected reads; application mutations use Server Actions. Session, membership and permission guards live close to data access and run at each exposed server entry point. Layout redirects and hidden controls do not provide authorisation.

Routes use explicit `/w/[workspaceSlug]` context. Resolve it with current membership, scope resource queries by workspace and resource identity, and avoid shared permission/result caches. A selection in another browser tab must not retarget a mutation. See [workspace onboarding](workspace-onboarding-plan.md) for the navigation preference and atomic creation details.

## Authentication and email policy

- Verification is required before normal sign-in or workspace creation. Development uses Mailpit without a verification bypass.
- Passwords are 8 to 128 characters. Library-managed hashing and opaque database sessions keep bearer credentials out of browser local storage.
- Sessions last seven days and refresh after one day of activity. Cookie session caching is disabled so revocation uses current server state.
- Server Component reads do not renew sessions. The browser checks on mount, focus and every 60 seconds while online; when due, the library refreshes both database expiry and cookie. An open tab can keep a session alive, so this is not a strict human-inactivity timeout.
- Password reset links last one hour, are single-use and revoke existing sessions on success. Completion returns to login. Verification links last 24 hours.
- Generic credential/reset feedback, bounded local request rates, callback restrictions and trusted origins protect exposed endpoints. Never trust arbitrary forwarded IP headers. Local database and inbox ports bind to loopback.

The [authentication hardening reference](auth-hardening.md) records the credential transaction guard, throttling and upgrade-sensitive concurrency behaviour.

## Deferred invitation and membership design

The intended invitation lifetime is seven days. Acceptance must require a signed-in user with the verified recipient email; a forwarded link or matching email domain grants no membership. Repeated acceptance must not create duplicates. Expired, cancelled and wrong-recipient invitations must fail safely.

Before enabling invitations, agree on exact member administration and accept/reject behaviour, verify the pinned library's semantics, and carry invitation context through registration and verification using validated local return paths. Invitees must not be forced to create a workspace. Admins must not grant ownership, change owners or delete the workspace. Test role escalation, removal and last-owner protection, including direct plugin endpoints.

## Verification boundaries

Relevant regressions cover verification, credential validation, session refresh/revocation, reset expiry/replay, throttling, blocked plugin endpoints, workspace creation rollback, membership-scoped reads and cross-tab workspace targeting. Setup and commands are maintained in the [README](../README.md#verification).
