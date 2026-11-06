---
name: ui-styling
description: Build or change VulnVault pages, forms, shared components, styling, and themes. Use for UI implementation and presentation refactoring that must follow the shared component architecture and preserve existing behaviour.
---

# UI and styling

## Establish the scope

- Read the UI rules in the root `AGENTS.md`. Read [the UI foundation plan](../../../docs/ui-foundation-plan.md) for component responsibilities and form regression requirements. Its proposal and migration sections describe completed work.
- Inspect the existing shared components before adding a component. Add only the components and variants required by the agreed change.
- Keep authorised data loading in `src/app` routes. Keep domain presentation in `src/features/*/components`.

## Compose shared components

- Pages and feature components must compose reusable TSX components. Put semantic HTML in shared UI and layout definitions. The root document layout may contain its required `html` and `body` elements.
- Reuse styled wrappers from `src/components/ui` for interactive controls. Build new interactive wrappers on the installed Base UI primitives. Use the primitives for focus, keyboard input, and dismissal behaviour.
- Put repeated page and form structure in `src/components/layout`. Keep shared layout and text components compatible with server rendering. Add client boundaries where interaction requires them.
- Put Tailwind classes in shared component definitions. Expose typed variants for differences in size, tone, or layout. Do not add cosmetic `className` overrides to pages or feature components.
- Put theme values in semantic tokens in `src/app/globals.css`. Preserve the green application identity in light and dark themes. Use the existing theme provider and persisted system, light, and dark preference.

## Loading, navigation, and available space

- Use React Suspense with reusable skeleton components for asynchronous page and section reads. Put the awaited data read inside the suspended child; a boundary added after the read cannot provide a loading fallback.
- Scope Suspense boundaries to the content being refreshed. After initial loading, keep filter panels and other stable controls mounted while result sections load. Use section skeletons for results; reserve whole-panel skeletons for initial loading. Preserve selections and pending feedback, and synchronize controls with URL changes such as Clear and browser Back/Forward.
- Match skeleton geometry to the loaded layout, including filters, board columns, and responsive heights. Loading, empty, and error states should retain the section's footprint instead of collapsing and moving surrounding content.
- Use client navigation for filters and preserve scroll position. Provide pending feedback while the requested URL loads. Do not clear a populated board into a zero-height state between filter results.
- Match content width to its task: keep dense boards fluid, bound inventory pages, align form headings with fields, and limit prose line length. Use compact list/grid variants instead of stretching short cards. On small screens, move secondary controls such as board filters into accessible Base UI drawers when that exposes the primary work sooner. Keep drafts outside overlays; close open overlays on desktop breakpoint changes, release scroll locks, and return focus to a visible control. Test both sides of every responsive breakpoint.
- Use available application width for dense work views. Keep readable form widths where useful. Prefer CSS-responsive layout that has the same initial geometry before and after hydration; avoid rendering a mobile layout on the server and replacing it with a desktop layout on mount.

## Motion

- Consider motion when adding or changing interactive elements. Use it to explain opening, closing, selection, and feedback. Drawers should slide from their attached edge; floating menus and selects can use a short fade/scale. Keep static content and dense work views still unless movement communicates a useful change.
- Define timing and easing in shared theme tokens and apply motion in shared component definitions. Prefer short, restrained transform/opacity transitions and focused control-state transitions. Avoid `transition-all`, animated layout dimensions, decorative page/card entrance sequences, and new animation dependencies without a demonstrated need.
- Follow the installed Base UI lifecycle and gesture variables for entrance and exit states. Preserve overlay mounting through exit, focus return, dismissal, scroll unlocking, and rapid reopen behaviour. Keep control state outside animated overlays and never delay validation or authorisation feedback for an animation.
- Respect `prefers-reduced-motion`: remove nonessential movement and finish state changes promptly. Verify actual entrance and exit movement with normal motion, plus reduced-motion completion, keyboard/nested overlays, rapid toggles, and breakpoint changes. CSS class presence alone does not prove an animation works.

## Preserve behaviour and accessibility

- Preserve form field names, values, refs, events, autocomplete, required state, and error associations. Keep the existing validation schemas and server validation authoritative.
- Preserve action payloads, URLs, and confirmation values. Presentation changes must not change authentication, permissions, or service and finding lifecycle rules.
- Preserve unsaved form values and their original version tokens together. Keep component identity stable across theme changes and refreshed server props. Retain the existing service form key, which includes the workspace slug and either the service ID or the new-service marker.
- Preserve semantic landmarks and heading levels. Keep navigation as real links and actions as buttons. Do not nest links or buttons inside another interactive element.
- Provide accessible labels and validation errors. Preserve keyboard operation, visible focus, and focus return after dismissing menus. Respect reduced motion.

## Verify the change

- Run lint and TypeScript checks. Use the root `AGENTS.md` verification rules to select the remaining application checks.
- Check the affected screens at mobile and desktop widths in both themes. For theme changes, also check persistence, system preference changes, and switching themes with unsaved form input.
- For changed controls, check keyboard operation and error feedback. For changed service forms, check that dirty input retains its original version token.
- If browser checks cannot run, state that limit and list the manual checks still required.
- Exercise delayed data and filter navigation, not only fast responses. Check skeleton-to-content geometry, scroll retention, and hydration stability. For dense boards, check that all columns fit at the intended desktop widths and that inactive mobile panels remain inaccessible to keyboard focus.
