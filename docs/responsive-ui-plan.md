# Responsive application layout

The responsive layout, mobile filter drawer and shared motion treatment are implemented.

## Scope and intent

Use space according to the task. The board benefits from the available screen width and height; forms, short inventories, and prose need limits. Keep the green theme and existing product behavior. Layout and motion preserve the underlying permission and persistence contracts.

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

Below 1024px, replace the large inline filter panel with a Filters button showing the number of applied filters and a modal drawer with a heading, Close action, scrollable content, Apply, and Clear. Count nonempty discovery and board filters and nondefault archive state. The count reflects the URL results, not unapplied draft values. Desktop retains inline controls with a compact surface. Between 1024px and 1279px, fields and actions wrap into readable rows; they must not be squeezed into one row.

Build the overlay on installed Base UI primitives without a new dependency. Keep draft and navigation state above the overlay so dismissal, theme changes, breakpoint changes, and navigation do not lose edits. Apply and Clear close the drawer and update the URL. Dismissal preserves the draft. Support Escape, backdrop dismissal, keyboard focus trapping and return, and body scroll locking. Nested Select popups must appear above the drawer and remain usable. Use unique IDs if desktop and mobile presentations coexist; CSS-hidden controls must not be accessible or focusable. Avoid viewport-dependent server markup that causes layout shifts during hydration. When an open drawer crosses to 1024px or wider, close it, release the focus trap and body scroll lock, and move focus to a visible desktop filter control rather than its hidden mobile trigger. A media listener may close the overlay; it must not switch the rendered page tree or own draft state.

Retain the persistent loaded filter component and existing independent server-authorized option/result reads. Only results switch to a skeleton after filtering. Initial loading reserves the compact filter toolbar on mobile and inline filter panel on desktop. Board geometry must remain stable through delayed requests, empty results, and filter errors. Preserve Back/Forward, same-URL Clear, unapplied drafts on refresh, and edits made during a pending request.

## Verification boundaries

Browser regressions exercise 320/390/768px routine pages, long names/URLs/emails, both themes, and boundaries at 1023/1024px and 1279/1280px. Check all six desktop columns, mobile tabs, readable result space, and absence of document overflow. Drawer tests cover Escape, backdrop and nested Select controls, focus return, body scroll locking, draft retention, history and delayed result skeletons.

A narrow-screen check previously exposed overflowing long Select options. Shared popup width limits and anywhere wrapping address that case. Preserve this regression along with stale form/version, authentication, access and workspace preference checks. Historical implementation verification passed 21 Chromium tests plus lint, TypeScript and build; those results describe that delivery, not a new test run.

## Motion

Use shared timing/easing tokens for purposeful motion in component definitions. The mobile filter drawer slides from the right while its backdrop fades, including exit and swipe dismissal. Floating menus and selects use restrained fade/scale transitions, controls transition state colours, and feedback fades in without moving surrounding content. Static content, route changes, and board result layouts have no decorative animation. Reduced-motion preference removes nonessential movement. Preserve Base UI lifecycle, focus and scroll handling, draft values, and immediate feedback. No separate animation dependency is needed.

Motion verification samples actual CSS transition progress for drawer/backdrop entrance and exit, menu/select fades and scales, and checks reduced-motion completion. Additional checks cover retained exits with rapid reopen, zero-duration live swipe tracking, swipe cancellation/dismissal, drafts, and existing breakpoint/focus behaviour. Menu dismissal modes marked instantaneous by Base UI remain instantaneous.
