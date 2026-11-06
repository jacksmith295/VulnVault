# Board interactions and visual refinement

## Scope

Make triage easier to scan and operate while retaining the shared component
architecture, green application identity, responsive board and WCAG 2.2 AA
target. Severity colours apply consistently to board cards, finding lists and
details: Critical red, High orange, Medium amber, Low blue, Informational neutral.
Labels remain visible; colour is supplementary. Theme tokens own both palettes.

Refine card emphasis, column headings/counts and interaction feedback. Keep
motion short, purposeful and removable through reduced-motion preferences.
No dashboard charts, additional workflow fields or unrelated navigation changes
are included.

## Moving findings

Use the current dnd-kit React package for pointer, touch and keyboard input.
Shared components own its DOM, styling, drag handles, targets and announcements.
Base UI continues to supply buttons, tabs and menus. A dedicated drag handle
keeps finding links, menus, text selection and ordinary touch scrolling usable.
The existing status menu remains an alternative that does not require dragging.

Desktop columns are status destinations. On smaller screens, show a compact set
of all status destinations during dragging without changing the board layout.
Escape, dropping outside a destination or onto the current status, and changes
to the board scope, revision or responsive layout must cancel safely.

Moving changes status only. Preserve server ordering within columns, bounded
pagination, filters, archived-service restrictions and existing authorisation.
No schema migration, manual ranking or new backend endpoint is needed. Both
menus and drops call the existing Server Action with the finding's version.

Share one pending update gate between both interaction methods. Preserve the
source card and server-owned cursors until the authoritative refresh arrives.
Prevent pagination races and duplicate mutations while updating. Report stale
versions, lost access and network failures, and retain a stable focus target
when a moved card leaves the current column or filter.

The drag library wraps its end callback in a React transition. Start the domain
save outside that callback's transition so drag cleanup and pending controls can
render while the Server Action is in flight. Capture the destination first,
check that the board is still mounted, and retain the shared mutation gate.
Cancellation focus waits for the library's rendering promise and cleanup rather
than an arbitrary delay. Keep sensor/plugin descriptors stable across renders.

## Verification and review

Measure severity contrast in both themes. Check pointer and keyboard moves,
touch scrolling, cancellation, disabled archived findings, pending updates,
stale versions, changed access, delayed responses, pagination, filtered-out
destinations and responsive transitions. Preserve existing axe, focus, dirty-form,
motion and authorisation regressions. Use only the separate test database.

Run lint, TypeScript, a production build and the relevant automated/browser
suites. Obtain independent plan and implementation reviews, then review the
published PR before handing it over for the user's merge approval.
