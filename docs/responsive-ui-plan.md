# Responsive application layout

Status: implemented after PR 9 and independently reviewed before PR creation.

## Scope and intent

Use space according to the task. The board benefits from the available screen width and height; forms, short inventories, and prose need limits. Keep the green theme and existing product behavior. This is a presentation refactor without schema, authorization, action, route, or deployment changes.

## Page and component responsibilities

| Content | Layout |
| --- | --- |
| Workspace board | Explicit wide page, six fluid columns from 1280px, existing status tabs below |
| Groups, services, workspaces, empty dashboard | Bounded default page, maximum 72rem including gutters |
| Create/edit/access forms and group detail | Narrow page, maximum 40rem, headings and fields aligned |
| Service and finding details | Readable page, maximum 56rem, descriptions limited to about 70 characters per line |
| Authentication | Retain current compact shell and verify mobile proportions |

Keep spacing and semantic HTML in shared UI/layout components, with typed width, grid, and density variants. Routine pages use modest vertical spacing rather than board-height stretching. Small screens use 1rem gutters and wrap actions beneath headings. Keep controls comfortably touchable. Shared links, member labels, metadata, and menu items must wrap long uninterrupted text without document overflow.

Inventories use compact semantic list cards in one column on small screens and bounded two/three-column grids when space permits. Group descriptions/counts remain readable. The group creation panel has a bounded width rather than spanning the inventory width. Repository and reference URL lists use compact rows without oversized nested boxes. Service management links form a small action group; archive/restore confirmation remains explicit and readable. No fields or detail content are removed or truncated out of reach.

## Mobile board filters

Below 1024px, replace the large inline filter panel with a Filters button showing the number of applied filters and a modal drawer with a heading, Close action, scrollable content, Apply, and Clear. Count nonempty group/service/severity/status and nondefault archive state. The count reflects the URL results, not unapplied draft values. Desktop retains inline controls with a compact surface. Between 1024px and 1279px, fields and actions wrap into readable rows; they must not be squeezed into one row.

Build the overlay on installed Base UI primitives without a new dependency. Keep draft and navigation state above the overlay so dismissal, theme changes, breakpoint changes, and navigation do not lose edits. Apply and Clear close the drawer and update the URL. Dismissal preserves the draft. Support Escape, backdrop dismissal, keyboard focus trapping and return, and body scroll locking. Nested Select popups must appear above the drawer and remain usable. Use unique IDs if desktop and mobile presentations coexist; CSS-hidden controls must not be accessible or focusable. Avoid viewport-dependent server markup that causes layout shifts during hydration. When an open drawer crosses to 1024px or wider, close it, release the focus trap and body scroll lock, and move focus to a visible desktop filter control rather than its hidden mobile trigger. A media listener may close the overlay; it must not switch the rendered page tree or own draft state.

Retain the persistent loaded filter component and existing independent server-authorized option/result reads. Only results switch to a skeleton after filtering. Initial loading reserves the compact filter toolbar on mobile and inline filter panel on desktop. Board geometry must remain stable through delayed requests, empty results, and filter errors. Preserve Back/Forward, same-URL Clear, unapplied drafts on refresh, and edits made during a pending request.

## Verification and delivery

1. Independent review of this plan before implementation; resolve material findings in the plan.
2. Parallel implementation with separate ownership for shared widths/inventory/detail presentation and mobile filter controls. Coordinator owns route width mapping, documentation, and browser coverage. Avoid shared-file conflicts.
3. Independent implementation review before opening a PR. Preserve user-owned AGENTS.md and unrelated untracked skills.
4. Run lint, TypeScript, production build, and existing browser regression suites. No persistence rules change; run database suites if implementation introduces query or permission changes. Run persistence and browser suites sequentially if both are needed. Exercise the actual pre-commit hook.
5. Browser checks at 320/390px, tablet 768px, and desktop 1440/2560px, in light and dark themes. Check bounded group cards/create panel, aligned form headings, readable detail text, long names/URLs/emails, and no document horizontal overflow. Also check 1023/1024px and 1279/1280px on either side of filter/column breakpoints. Check all six desktop board columns, mobile status tabs, and usable result area with filters closed.
6. Test drawer opening/closing, Escape/backdrop/focus return, nested Select keyboard selection, Apply/Clear, applied count, draft retention across dismissal/theme/breakpoints, URL history, and slow-query skeleton geometry. Resize an already-open drawer across its breakpoint, assert the overlay closes, scrolling unlocks, and focus is visible in desktop controls. Retain stale form/version, authentication, group access, and preference regressions.
7. Create a focused PR only after implementation review and checks pass. Obtain a fresh published review against its exact head/base and inspect discussions/checks. The coordinator submits the review on GitHub to avoid unsupported TUI subagent interactions. Do not merge without user approval.

No unresolved product decisions are required to start. Default thresholds and widths above are implementation choices to verify in the browser, not new product contracts.

## Design review outcome

Independent review identified drawer resize focus/scroll-lock handling and missing breakpoint boundary checks. Both are included above, along with wrapping inline controls at intermediate widths. No unresolved design blockers remain.

## Implementation and verification

Shared widths, grid/density variants, readable text, compact URL rows, route width mapping, and the responsive filter drawer are implemented. Implementation review prompted keyboard/nested-Escape checks and opening long filter options at 320px. The latter reproduced dropdown overflow; a shared Select width limit and anywhere wrapping fixed it. Both checks now pass.

Lint, TypeScript, the production build, UI skill validation, and all 21 Chromium browser tests passed. Browser coverage includes 320/390/768px routine pages with long text, 1023/1024 and 1279/1280 breakpoints, both themes, drawer focus/scroll-lock handling, drafts, history, and delayed board skeletons. Existing authentication, authorization, stale-form/version, and workspace-preference browser regressions pass. Database queries, mutations, schemas, and migrations are unchanged; persistence-only suites were not rerun for this presentation change.
