# Service access groups

Status: merged in PR 7. This slice establishes access control before the workspace findings board.

## Agreed behaviour

- Each workspace has a protected default group named Everyone. Membership is implicit: every current workspace member belongs automatically. Workspace registration remains separate from account registration.
- Services with no specific groups assigned use Everyone. Assigning one or more custom groups replaces the default access; membership in any assigned group grants access.
- Owners and admins initially retain access to every service and manage groups and service access. Ordinary members can read accessible services and create/update their findings, but cannot manage services or groups.
- A custom group with no members is valid. A service assigned only to empty groups is accessible to owners/admins only.
- Returning a restricted service to default access requires an explicit confirmation that every workspace member will gain access. Removing a group member revokes the access granted by that group, but another assigned group may still grant access.
- Groups cannot be deleted in this slice. Everyone cannot be renamed or have its membership edited. Invitations, workspace membership administration, group-specific roles, and nested groups are deferred.
- Archived services obey the same access rules. Owners/admins can change their access without restoring them; their findings remain read-only until restoration.

## Data and migration

Add workspace-owned groups, custom-group memberships, and custom-group service associations. Group memberships reference workspace membership IDs, so removing and rejoining a workspace does not revive old grants. Composite foreign keys enforce workspace consistency for associations.

Store the default group as a protected group record but keep its membership and service access implicit. Do not allow default membership rows or explicit default service assignments alongside custom groups. Enforce default uniqueness per workspace. Create the default group in the workspace creation transaction and backfill existing workspaces with an additive migration.

Existing services keep their workspace-wide accessibility because they have no custom assignments. Preserve existing records and migrations; no database reset is needed.

## Authorisation and concurrency

Use shared access predicates for authorised service lists and details, repositories, finding lists/details, and finding writes. Query only authorised records. Direct links and forged action arguments must not bypass access checks. Unknown workspace roles fail closed; custom groups never grant workspace membership.

Acquire the workspace permission lock before membership, service, and finding locks. Finding writes and ordinary service mutations hold a shared workspace lock; permission changes hold an exclusive workspace lock. Re-read membership and permissions after acquiring locks. This serializes revocation with writes while avoiding lock-order inversions. Future workspace membership mutations must use the same protocol.

Group edits match an expected group version. Service access changes match and increment the existing service version, so stale service/access forms cannot overwrite newer settings. Change membership/access associations atomically with their version updates. Preserve original versions and unsaved fields across theme changes and refreshed server props.

## UI and actions

- Workspace owners/admins get a Groups link, a list including Everyone, and custom-group creation and editing with existing workspace member selection.
- Service details link to Manage access. Its form offers Default group or Selected groups and makes the effective access clear. Selected groups requires at least one custom group; default fallback requires confirmation when broadening existing access.
- Use existing shared TSX layouts and styled Base UI controls. Keep HTML and cosmetic styling in shared component definitions.
- Use Next.js Server Actions for mutations, strict server validation, server-enforced permissions, and relevant path revalidation. Keep provider integrations independent.

## Verification and delivery

Use isolated PostgreSQL integration tests for default provisioning, upgrade preservation, multi-group access, owner/admin bypass, revoked access, workspace/member scope, rejoining, stale versions, default protection, rollback, and permission-change races. Check actual database constraints as well as application validation.

Browser checks cover owner group creation/editing, member access before and after restriction/revocation, service access confirmation, multiple groups, stale forms, themes, and mobile layout. Retain existing authentication, workspace, service, findings, and hook regressions. Run integration and browser suites sequentially.

Separate medium-reasoning agents implement and independently review changes. Run lint, TypeScript, production build, automated tests, browser tests, and staged hook checks. Commit and push a feature branch and open a PR for user review. The board follows in a separate slice, with authorised filters and counts, before drag-and-drop.
