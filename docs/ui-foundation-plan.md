# UI foundation and theming

Status: merged in PR 4. Includes next-themes and the approved shared component architecture. The staged UI hook followed in PR 5.

## Agreed direction

- Keep Tailwind, with styles in reusable component definitions and typed variants.
- Refine the current green accent into a consistent application theme.
- Support light, dark, and system preference.
- Pages and feature components should compose reusable components with minimal raw HTML. Shared components own semantic HTML and presentation defaults.
- Use styled Base UI primitives for interactive controls. Keep feature logic separate from reusable presentation.

## Findings

The app has a useful starting point: Base UI Button and Input, shadcn Base Nova conventions, semantic CSS variables, and shared AppHeader. However, route files and feature forms repeat container widths, spacing, headings, borders, links, field wrappers, errors, and controls. Service textareas and archive checkboxes are styled natively. Workspace navigation uses details and custom dismissal listeners.

The dark palette currently loses the green brand accent. Light primary green with white foreground needs contrast adjustment. Typography, control sizing, spacing, focus treatment, and surfaces need consistent defaults.

## Component layers

| Layer | Responsibility | Initial components |
| --- | --- | --- |
| Global theme | Semantic values and inherited foundations | Light/dark colour tokens, typography scale, control sizing, spacing, radii, shadows, focus, reduced motion |
| `components/ui` | Styled primitives and variants | Button, link variants, Input, Textarea, Field parts, Checkbox, Menu parts, Card, Badge, feedback message, text/heading primitives |
| `components/layout` | Repeated semantic structure | Page, PageHeader, Section, Stack, Inline, FormLayout, FormActions, EmptyState, AppHeader |
| `features/*/components` | Feature presentation and interaction | WorkspaceSelector, WorkspaceList, ServiceList, ServiceDetails, repository list, existing forms |
| `app` routes | Authorised data loading and composition | Compose page/layout/feature components with minimal presentation code |

Keep this inventory limited to patterns used by existing screens. Do not introduce a configurable page schema or a generic form-generation framework. Preserve server-compatible layout/text components; interactive Base UI wrappers and providers form focused client boundaries.

## Styling ownership

- `globals.css` owns semantic theme tokens and a small foundational layer. Colours and typography inherit where CSS supports inheritance; components consistently consume the same tokens for other properties.
- Component implementations own Tailwind classes. Use typed variants such as size, tone, emphasis, and layout width instead of repeated overrides at call sites.
- Default page and feature usage should not need cosmetic `className` strings. Genuine layout exceptions must be small and explicit; repeated exceptions become a component variant.
- No hardcoded palette colours, repeated field markup, independent textarea styles, native checkbox styling, or independently styled navigation links in feature screens.
- Raw semantic HTML belongs primarily in reusable component implementations. Maintain meaningful headings, valid links/buttons, labels, landmarks, error descriptions, and keyboard interaction.
- Reuse the existing Card where suitable. Base UI supplies behaviour primitives, while application-owned layout, typography, and surface components supply presentation where no Base UI primitive exists.

## Theme proposal

Add `next-themes` for a class-based provider with a system default and browser-persisted preference. It handles system changes and early theme application; avoid maintaining another custom theme persistence/startup system. This is the only proposed new runtime dependency, subject to compatible-version verification.

Use a shared theme selector in the application header and public authentication shell. Light, Dark, and System are explicit choices. Keep server-rendered markup stable until theme-dependent client values are available. Theme changes must update variables/classes without remounting the application or clearing form state.

Tune both palettes together: neutral surfaces, readable text, green primary/focus/accent, clear error and status colours, consistent borders and elevation. Check normal text contrast at 4.5:1 and large text at 3:1, plus distinguishable control boundaries and focus. Disabled controls must remain recognisable. Respect reduced motion.

## Migration

1. Define tokens and theme support, then establish shared primitives and layout defaults against real screens.
2. Replace the workspace selector with a styled Base UI Menu. Use the primitive for dismissal, keyboard navigation, positioning, and focus management; remove the native details and custom document listeners.
3. Refactor authentication and workspace screens onto shared fields, messages, links, surfaces, and page/form layouts.
4. Refactor service forms, service list/detail, repository links, archive confirmation, and empty states using the same components.
5. Review both themes at desktop and mobile widths, update accessible browser selectors, and record the ownership rules in AGENTS.md. Enforce component composition and central styling with scoped ESLint rules; exempt the required root document HTML.

Keep authentication, authorisation, transactions, validation schemas, server endpoints, migrations, URLs, and service lifecycle behaviour intact. Presentation changes must not become a reason to alter those contracts.

## Regression requirements

- Preserve React Hook Form refs and events. Existing schemas and server validation remain authoritative. Base UI Field uses external validation state without introducing a competing validation flow.
- Preserve form names and values, autocomplete, required state, error associations, submission feedback, and `confirmed=yes` archive/restore semantics.
- Preserve service dirty input and its original version token together. Retain the slug/service ID component key. Theme changes and refreshed server props must not clear edits or permit stale overwrites.
- Workspace menu supports pointer and keyboard use, outside dismissal, Escape and focus return, current-workspace indication, route changes, long names, and small viewports. Keep explicit URLs and membership-checked navigation preferences.
- Composed Next links remain real links. Avoid nested anchors or buttons. Preserve one main landmark and meaningful heading levels.
- Existing tests locating native details/summary must move to accessible menu trigger, menu, and menuitem roles. Test behaviour rather than the removed markup.
- Verify theme persistence, first load, system preference changes, keyboard menu behaviour, mobile overflow, and theme switching with an unsaved service form.

Run lint, TypeScript, the existing integration suite, production build, and browser tests sequentially. Use medium reasoning implementation and independent review agents, with clear ownership of primitives, migrations of screens, and verification. No database migration is expected.

## References checked

- [Base UI styling](https://base-ui.com/react/handbook/styling)
- [Base UI composition](https://base-ui.com/react/handbook/composition)
- [Base UI Menu](https://base-ui.com/react/components/menu)
- [Base UI Field](https://base-ui.com/react/components/field)
- [next-themes](https://github.com/pacocoursey/next-themes)

Use installed Base UI 1.6 APIs when implementing; current online examples may show newer APIs. An upgrade is not required for this plan.
