# Service management

Status: implemented on its feature branch, including the approved schema, permissions, version checks, and archive/restore lifecycle. Awaiting PR review and merge. Services precede invitations to make the solo workflow useful sooner.

## Experience

- The workspace landing page lists active services and offers an archived-services view. Owners/admins see Create service; members have read access.
- Creation asks for a name, optional description, and zero or more repository URLs. No repository integration credentials or automatic connection is required.
- Each service has a detail page showing its description, repository links, and archive status. Owners/admins can edit active services, archive them, and restore archived services. Editing an archived service requires restoring it first.
- Archive and restore are explicit actions. Archiving removes a service from the default list while preserving its details and repository associations. No permanent deletion is exposed.
- Continue to use the shared app header and workspace selector. Routes carry the workspace slug explicitly: `/w/[workspaceSlug]`, `/w/[workspaceSlug]/services/new`, `/w/[workspaceSlug]/services/[serviceId]`, and `/w/[workspaceSlug]/services/[serviceId]/edit`.
- Service names may repeat. Stable IDs identify services, so renaming never changes their URLs.

## Proposed schema

Add two tables through a reviewed additive Drizzle migration. Leave existing authentication and workspace tables and data intact.

| Table | Columns and constraints |
| --- | --- |
| `service` | Opaque text UUID primary key, non-null workspace ID referencing `organization`, required name, optional description, nullable `archivedAt`, creation/update timestamps, integer `version` starting at 1. Index workspace ID and archive state for listing. Workspace foreign key restricts physical deletion. |
| `service_repository` | Opaque text UUID primary key, required service ID referencing `service`, required URL. Unique pair of service ID and normalized URL. Physical service deletion cascades to its associations, but no application operation physically deletes a service. |

Repository ownership is derived through the service. The same URL may appear on different services. Do not duplicate workspace identity in repository rows or introduce provider-specific identities before integration requirements are designed.

Proposed validation limits:

- Name: trimmed, 2 to 100 characters. Description: optional, at most 5,000 characters; blank becomes absent.
- Repository URLs: optional, at most 20 per service, each at most 2,048 characters. Support HTTP/HTTPS, including self-hosted hostnames and ports. Require a nonempty repository path.
- Reject credentials, query strings, and fragments in repository links. Do not store access tokens in them or fetch the URLs server-side. Render links safely.
- Normalize surrounding whitespace, URL scheme/host casing through standard URL parsing, and trailing slashes. Preserve path casing and `.git`; do not guess provider equivalence. Reject duplicates after normalization with a useful error.
- Validate all fields on the server, reject forged application fields, and retain the database unique constraint as a final safeguard.

## Permissions and persistence

Create a `features/services` module with validation, server-only data access, Server Actions, and focused UI components. Server Components perform reads. Shared layout and auth code remain responsible for their existing roles.

- Every operation requires a verified session and fresh workspace membership. Owner/admin manage services; member can view active and archived services. Unknown roles fail closed.
- Resolve a service using both its ID and the authorised workspace ID. Apply the same scope when reading or modifying repository associations. Inaccessible and missing resources have the same not-found experience.
- Check mutation permissions within the database transaction and lock the membership row until commit, using consistent lock ordering. Membership removal or demotion must not race past an earlier permission check.
- Create the service and repository associations atomically. Edit service details and repository associations together. Preserve IDs for unchanged associations; delete only explicitly removed associations within the edit transaction.
- Use an integer version for concurrent edits. Every edit, archive, or restore conditionally matches the submitted version and required archive state, then increments the version. Stale submissions fail with a useful reload/retry message and do not modify repositories.
- Keep timestamps for display, rather than using them as concurrency tokens. Creation derives ownership from authorised workspace context rather than trusting browser-supplied ownership fields.
- Return bounded projections and generic recoverable failure messages. Preserve form values after validation, conflict, or persistence errors. Keep sensitive information out of logs.

## Verification and review

Integration coverage against isolated PostgreSQL includes migration preservation, atomic service/repository creation and edits, normalized duplicates, concurrent edits, archive/restore conflicts, cross-workspace forged IDs, different roles across a user's memberships, direct member mutation attempts, revoked membership, and rollback on repository persistence failure.

Browser coverage includes create/view/edit, multiple repository links, member read-only views, archive hiding from the default list, archived browsing and restore, stale-form recovery, cross-workspace denial, and existing workspace/header/authentication regressions.

Run lint, TypeScript checks, relevant integration tests, a production build, and browser checks. Use medium reasoning for implementation and independent design/code review. Address findings before opening a PR for the user's approval.

Findings, scanners, provider connections, invitations, member administration, search/filter systems beyond archive state, permanent deletion, and deployment are outside this slice.
