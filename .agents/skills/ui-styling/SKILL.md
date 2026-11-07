---
name: ui-styling
description: Build or change VulnVault pages, forms, shared components, styling, and themes while preserving the shared component architecture and existing behaviour.
---

# UI and styling

## Shared architecture

Inspect existing shared components before adding only the components or variants the agreed change needs.

- Keep authorised data loading and composition in `src/app`; domain presentation and interaction belong in `src/features/*/components`.
- Pages and features compose reusable TSX components. Shared `src/components/ui` and `src/components/layout` definitions own semantic HTML, Tailwind classes, and repeated page/form structure. The root document layout may contain its required `html` and `body`.
- Reuse styled interactive wrappers in `components/ui`; build new ones on installed Base UI primitives for keyboard, focus, and dismissal behaviour. Keep layout/text components server-compatible and add client boundaries only for interaction.
- Expose typed variants for presentation differences instead of cosmetic `className` overrides in pages or features. Keep semantic theme tokens in `src/app/globals.css`.
- Preserve the green identity in both themes and the existing provider's persisted System, Light, and Dark preferences. Reuse severity badges/tokens consistently with visible labels; colour alone must not convey risk.

## State, loading, and layout

- Use Suspense and reusable skeletons for asynchronous page/section reads. Await the read inside the suspended child so its fallback can appear. After initial loading, keep stable controls mounted and suspend refreshed results only.
- Retain useful geometry through loading, empty, and error states. Match skeletons to the responsive content footprint; avoid collapsed results and hydration layout shifts. Prefer CSS-responsive layouts over replacing the server tree after mount.
- Match width to the task: fluid dense work views, bounded inventories/forms, readable prose. Preserve client filter navigation, pending feedback, scroll position, and URL synchronization including Clear and Back/Forward.
- Preserve action payloads, URLs, confirmation values, validation schemas, and authoritative server validation. Presentation changes must preserve authentication, permissions, and service/finding lifecycle rules.
- Preserve field names, values, refs/events, autocomplete, required state, and error associations. Keep dirty values and their original version token together across theme changes and refreshed props; preserve component identity. For service forms retain the workspace-slug plus service-ID/new-service key.

## Interaction and accessibility

- Target WCAG 2.2 AA. Preserve landmarks, heading levels, skip navigation, visible labels in accessible names, validation associations, password paste/autocomplete, real links for navigation, and buttons for actions. Avoid nested interactive elements.
- Preserve keyboard operation, visible focus, and focus return. Keep focus clear of sticky headers. If an update removes or moves the focused item, announce the result and focus a stable meaningful target.
- Check rendered contrast including hover/translucent surfaces: 4.5:1 normal text, 3:1 large text, and 3:1 essential control boundaries/state indicators. Decorative borders and disabled controls have exceptions. Keep focus outlines opaque, separated from filled controls, and visible in forced colours.
- Maintain 24 CSS pixel targets or documented WCAG exceptions, 320 CSS pixel reflow, 200% text resizing, and text-spacing overrides without clipping.
- Use purposeful, restrained motion in shared components with shared timing/easing tokens. Prefer transform/opacity and specific state transitions; avoid `transition-all`, animated layout dimensions, and decorative entrance sequences. Respect reduced motion by removing nonessential movement and completing changes promptly.
- For overlays, preserve installed Base UI entrance/exit lifecycle and gesture behaviour, retained exit mounting, dismissal, focus return, scroll unlocking, and rapid reopen. Keep drafts/control state outside overlays and never delay validation or authorisation feedback for animation.

## Read details when the change needs them

Read only the relevant sections. These documents also contain historical plans and verification results; those are context, not instructions to repeat completed migrations or expand the current scope.

- For component responsibilities or form refactors, consult [UI foundation: component layers and regression requirements](../../../docs/ui-foundation-plan.md#component-layers). Preserve external form validation and the original dirty-form version/identity contract.
- For responsive layouts, filters, or drawers, read [responsive layout responsibilities and mobile board filters](../../../docs/responsive-ui-plan.md#page-and-component-responsibilities). This covers draft retention, same-URL Clear/history, hidden controls, nested overlays, breakpoint focus/scroll cleanup, and loading geometry. Consult its motion section when changing transitions.
- For findings board tiles or drag interactions, read [board interactions](../../../docs/board-interactions-plan.md). Preserve accessible keyboard/non-drag alternatives, safe cancellation, server-owned ordering/versions, the shared pending mutation gate, and truthful save feedback. Cancel owned animations on cleanup. Tile lift/reflow and drag-library cleanup mechanics apply to that board, not every UI component.
- For accessibility changes or expanded checks, read [accessibility findings and verification limits](../../../docs/accessibility-review.md#findings-and-changes).

## Verify the affected behaviour

Follow `AGENTS.md` for required application checks, including lint and TypeScript. Select visual and interaction checks for the behaviour at risk; this is not a full regression matrix for every edit. Check changed controls with keyboard and error feedback, and inspect affected mobile/desktop layouts in both themes when layout, styling, or theme behaviour changes.

Choose additional checks by the change:

- Themes/forms: preference persistence, system changes, dirty input with its original version, and stable component identity.
- Loading/navigation/responsive layouts: delayed responses, skeleton geometry, scroll, hydration, history/Clear, and both sides of changed breakpoints.
- Motion/overlays: actual entrance/exit movement, reduced-motion completion, nested keyboard operation, rapid toggles, and breakpoint cleanup. CSS class presence alone is insufficient.
- Accessibility: use existing axe Playwright coverage for representative routes/open overlays; supplement with focus, contrast, resizing, and spacing checks. A passing axe scan does not establish full WCAG conformance or replace assistive-technology testing.

Report automated results and manual limits separately. If browser checks cannot run, identify the concrete checks still needed.
