# Workspace findings board

Status: implemented for PR review after the hardening merge. The user confirmed 20 findings per status column with Load more, and status tabs on mobile.

## Experience

- Make `/w/[workspaceSlug]` the workspace findings board, retaining the workspace name as the page heading. Show Services beside Groups, with Groups limited to owners/admins. Services opens `/w/[workspaceSlug]/services`, including its active/archive tabs. Keep service-specific finding details and editing at their existing URLs.
- Keep `/w/[workspaceSlug]/findings` as a compatibility redirect after verified-session and workspace-membership checks. Preserve every query key and repeated value so invalid filters still fail closed at the canonical board URL.
- At viewport widths of 1280px and above, show six fluid status columns: New, Triaged, In progress, Resolved, Rejected, and Accepted risk. The columns fill the available width without horizontal board scrolling. Each has a bounded height, independent vertical card scrolling, and a heading that stays visible. Below 1280px, status tabs show one column at a time.
- Cards show title, severity, affected service, and a status menu. Titles link to finding details. Menus change status after server confirmation; dragging, assignment, and deletion are outside this slice.
- Filters select group, service, severity, status, and active/archived/all services. Active services are the default. Keep filter state in the URL for refresh, browser history, and sharing. Applying or clearing filters resets loaded pages.
- Load initial filter options behind a workspace-scoped React Suspense boundary with a full skeleton. Keep the loaded filter panel mounted during query changes, and use a separate query-keyed boundary and board-only skeleton for finding results. Filter options and findings independently enforce current permissions. Applying and clearing filters use navigation transitions with pending feedback and preserve page scroll. URL changes through Back/Forward synchronize the controls; unrelated refreshes preserve unapplied drafts.
- Each column starts with at most 20 cards, newest first. Load more retrieves another bounded page for that column. Column totals represent every matching authorised finding, not only loaded cards. A selected status also applies to totals, so the other columns have zero matching findings.
- Archived-service cards remain readable and have no status action. Restoring remains an owner/admin service operation.
- Use shared TSX layout and styled Base UI primitives, green semantic theme tokens, keyboard-accessible menus/tabs, and clear pending/error feedback. Keep page overflow contained at mobile and desktop widths.

## Permissions and queries

Every query requires a verified session and a current known-role workspace membership. Apply the shared service access predicate before filtering, counting, and pagination. A group filter narrows visibility; it never grants access.

Owners/admins can filter by any group in their workspace. Members can choose Everyone and groups they belong to. Everyone selects services without custom group assignments. Service options include only services the user can access. Do not expose hidden service/group names, counts, or membership rosters.

Validate scalar filter values and authorised IDs on the server. Unknown, duplicate, malformed, inaccessible, or cross-workspace filters return an empty board with a recoverable message and Clear filters, rather than silently widening the query.

Use compact card projections, omitting descriptions, remediation notes, references, and actor IDs. Initial columns, totals, and filter options share a short read-only repeatable-read transaction. No schema or index migration is planned; revisit indexes only with demonstrated query needs and an agreed migration.

Pagination orders by `(created_at DESC, id DESC)`. Resolve cursor anchors within the authorised workspace and compare the tuple in PostgreSQL so timestamp microseconds survive. Do not require the anchor to retain its old status or filter values. An inaccessible or missing anchor requires a board refresh rather than restarting at page one.

Load-more requests repeat authentication, permission, and filter validation. Compare a server-computed access-scope key with the initial scope. If access, service metadata, or available group filters change, clear retained cards and refresh the board. Losing workspace membership clears the board through the access boundary. Ignore late responses from a previous filter or board revision and deduplicate appended records.

## Status updates and cache freshness

Add a status-only mutation that shares the existing workspace-first permission lock, active-service check, finding row lock, expected-version check, and resolution lifecycle. Update only status, resolution/update metadata, and version. Preserve description, notes, severity, references, and association IDs.

Set the resolution timestamp when entering Resolved, preserve it for an unchanged Resolved status, and clear it when leaving Resolved. No-op transitions do not bypass concurrency checks. Stale or unauthorised updates return recoverable feedback without overwriting newer work.

Server Components load the initial board inside the Suspense boundary. An authenticated GET Route Handler at `/w/[workspaceSlug]/findings/more` serves bounded additional pages with `Cache-Control: private, no-store`; it accepts the board filters plus single `column`, `cursor`, and `scope` parameters. Unknown or repeated filters and invalid pagination parameters require a board reset. The client also disables fetch caching. Status mutations remain Server Actions. Reset loaded pages after successful status updates or refreshed server data. Revalidate the canonical workspace board after finding and service mutations, and the Services listing after service mutations; existing group/access layout invalidation also covers both.

Workspace preference writes use a separate authenticated POST Route Handler at `/w/[workspaceSlug]/preference`, with an Origin check against the configured application origin. The selector serializes writes and skips obsolete queued selections. These background cookie writes and GET pagination requests do not cause an incidental React Server Component refresh, so loaded pages survive unrelated preference updates. A deliberate refresh still replaces retained cards with current server data.

## Verification and delivery

Integration tests use isolated PostgreSQL and cover role/group visibility, hidden counts, invalid filters/cursors, independent pagination, timestamp precision, changed-status anchors, access removal between pages, status lifecycle, preserved fields/references, stale versions, and archive/permission boundaries.

Browser checks cover filters and URL state, Load more, status menus, member revocation, archived cards, stale status edits, keyboard controls, both themes, and layout above and below the 1280px breakpoint. Check stable pending geometry during delayed initial/filter requests and retained pagination after background workspace preference writes. Retain the authentication, credential-race, service, group, finding, and hook regressions. Run persistence and browser suites sequentially.

Use independent design and implementation review before creating the PR. After publishing, obtain a fresh review of the published head, inspect checks and discussions, post the review outcome on GitHub, and provide the merge recommendation. Preserve the user's uncommitted working agreements and skills; they are not part of the board commit without permission.
