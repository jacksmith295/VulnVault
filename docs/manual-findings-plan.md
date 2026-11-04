# Manual findings

Status: implemented for PR review. The approved scope includes the schema, statuses, transitions, archived-service read-only policy, and no deletion for any role.

## Ownership and experience

- Every finding belongs to exactly one service. Its service cannot be changed after creation in this slice. The same underlying vulnerability may have separate findings in different services, with independent statuses, notes, and resolution dates. No global CVE deduplication is introduced.
- Add a findings section to service details, with list, create, detail, and edit flows. Start with a simple list; the board and assignment are a later slice.
- Routes: `/w/[workspaceSlug]/services/[serviceId]/findings/new`, `/findings/[findingId]`, and `/findings/[findingId]/edit`, all under the same service route prefix.
- All known workspace roles can create and update findings. Service management remains owner/admin-only. No role may delete findings. Rejection and resolution retain the record.
- Agreed archived-service policy: findings remain readable, but creating or updating them requires the service to be active. Members must ask an owner/admin to restore an archived service first.
- Use shared UI/layout components throughout. Add a reusable styled Base UI Select for severity/status, with feature-level badge compositions using shared semantic variants. Do not introduce native HTML or cosmetic className overrides in routes/features.

## Fields and lifecycle

Required: title, description, service, and severity. Optional: reference URLs and remediation notes.

- Severity: Critical, High, Medium, Low, Informational.
- Status: New, Triaged, In progress, Resolved, Rejected, Accepted risk.
- Creation always starts at New. Editing permits transitions between any of these statuses, including reopening; there is no additional workflow restriction in this slice.
- Keep remediation notes optional in every status, as agreed. Rejected and Accepted risk remain distinct from Resolved and do not mean the vulnerability was fixed.
- Set the resolution timestamp when entering Resolved, preserve it while editing a finding that remains Resolved, and clear it when moving out of Resolved.
- Limits: trimmed title 2 to 200 characters; required description up to 20,000 characters; optional remediation notes up to 20,000 characters; at most 20 reference URLs, each at most 2,048 characters before and after normalization.
- Description and notes are plain text rendered safely. Markdown editing, evidence uploads, attachments, CVSS calculation, and custom fields are deferred.
- References support HTTP/HTTPS, reject embedded credentials, and are not fetched server-side. Ordinary queries and fragments are allowed for reference links. Normalize whitespace and standard URL serialization while preserving meaningful path casing, trailing slashes, queries, and fragments. Reject normalized duplicates.

## Approved schema

Use an additive migration with two new tables. Existing data and migrations remain intact.

| Table | Fields and constraints |
| --- | --- |
| `finding` | Opaque text UUID primary key; required service ID with delete restriction; title; description; severity; status defaulting to New; nullable remediation notes; created/updated timestamps; nullable resolved timestamp; integer version starting at 1; nullable creator/updater user IDs with `ON DELETE SET NULL`. Database checks constrain severity, status, and positive version. Index service ID, creation time, and ID for stable listing. |
| `finding_reference` | Opaque text UUID primary key; required finding ID with cascading physical deletion; URL; unique finding ID/normalized URL pair. Cascading association cleanup does not expose a finding deletion operation. |

Workspace ownership is derived through the service. Avoid duplicating workspace identity or introducing a global vulnerability entity prematurely. Actor IDs are set by the server, not accepted from a form. Actor metadata and timestamps are not a full change-history audit trail; activity history is a future design decision.

## Permissions and transactional behaviour

- Every operation requires a verified session and fresh known-role membership. Unknown roles fail closed.
- Scope finding access by authorised workspace, route service ID, and finding ID together. A valid finding ID from another service or workspace must reveal no data and permit no mutation.
- Mutations use consistent lock order: membership, service, then finding. Hold membership and service share locks while confirming permissions and active service state, so membership revocation and service archival serialize with writes.
- Create/edit the finding and its references atomically. Preserve IDs for unchanged references. Remove only explicitly omitted associations as part of the same successful edit transaction.
- Every edit matches the submitted integer version and increments it. A stale update changes neither the record nor its references and returns a recoverable conflict message.
- Preserve initial field values and their version token together across theme changes and refreshed server props. Keep the form keyed by workspace/service/finding identity, not by theme or current version.
- Server Actions accept only approved fields. Service ownership, actors, versions stored in the database, and resolution timestamps are server-controlled. The submitted expected version is a concurrency condition, never permission evidence.
- Reuse existing validation, feedback, loading, link, page, and form conventions. Preserve unsaved input after failure and provide an explicit reload path for conflicts.

## Verification

Integration tests use isolated PostgreSQL and cover all roles, signed-out/unverified requests, revoked membership, forged workspace/service/finding combinations, archived services, valid/invalid fields, normalized references, independent resolution of the same vulnerability across services, timestamps during resolution/reopening, concurrent edits, reference-write rollback, and permission/archive races.

Browser tests cover manual create/view/edit, severity/status controls, references and notes, retained stale edits, member workflows without delete controls, archived-service read-only views, independent per-service resolutions, mobile layout, keyboard controls, and both themes. Retain existing authentication, workspace, service, theme, and hook regressions.

Run lint, TypeScript, hook tests, relevant integration tests, production build, and browser checks. Use separate medium-reasoning implementation and review agents, address findings, and open a PR for user review. No deployment or main merge is included.

## Deferred scope

Board/drag-and-drop, assignment, invitations, automatic ingestion, global vulnerability matching, attachments, rich text, notifications, full activity history, and workflow customization. Finding deletion is prohibited rather than a planned feature.
