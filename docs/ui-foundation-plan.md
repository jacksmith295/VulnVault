# UI foundation and theming

The shared component architecture, next-themes support and staged UI hook are implemented.

## Direction

- Keep Tailwind, with styles in reusable component definitions and typed variants.
- Refine the current green accent into a consistent application theme.
- Support light, dark, and system preference.
- Routes compose components with minimal presentation code. Shared and feature component definitions own semantic HTML and styling, using shared controls and tokens.
- Use styled Base UI primitives for interactive controls. Keep feature logic separate from reusable presentation.

## Component layers

| Layer | Responsibility | Components |
| --- | --- | --- |
| Global theme | Semantic values and inherited foundations | Light/dark colour tokens, typography scale, control sizing, spacing, radii, shadows, focus, reduced motion |
| `components/ui` | Styled primitives and variants | Button, link variants, Input, Textarea, Field parts, Checkbox, Menu parts, Card, Badge, feedback message, text/heading primitives |
| `components/layout` | Repeated semantic structure | Page, PageHeader, Section, Stack, Inline, FormLayout, FormActions, EmptyState, AppHeader |
| `features/*/components` | Domain markup, styling and interaction | WorkspaceSelector, WorkspaceList, ServiceList, ServiceDetails, repository list, existing forms |
| `app` routes | Authorised data loading and composition | Compose page/layout/feature components with minimal presentation code |

Keep this inventory limited to patterns used by existing screens. Do not introduce a configurable page schema or a generic form-generation framework. Preserve server-compatible layout/text components; interactive Base UI wrappers and providers form focused client boundaries.

## Styling ownership

- `globals.css` owns semantic theme tokens and a small foundational layer. Colours and typography inherit where CSS supports inheritance; components consistently consume the same tokens for other properties.
- Component implementations own Tailwind classes. Use typed variants such as size, tone, emphasis, and layout width instead of repeated overrides at call sites.
- Keep feature-specific presentation with its feature. Prefer shared variants for recurring differences; avoid one-off wrappers in shared UI solely to satisfy composition rules.
- No hardcoded palette colours, repeated field markup, independent textarea styles, native checkbox styling, or independently styled navigation links in feature screens.
- Raw semantic HTML belongs primarily in reusable component implementations. Maintain meaningful headings, valid links/buttons, labels, landmarks, error descriptions, and keyboard interaction.
- Reuse the existing Card where suitable. Base UI supplies behaviour primitives, while application-owned layout, typography, and surface components supply presentation where no Base UI primitive exists.

## Theme behaviour

Use `next-themes` for a class-based provider with a system default and browser-persisted preference. It handles system changes and early theme application; avoid maintaining another custom theme persistence/startup system. The provider is already installed.

Use a shared theme selector in the application header and public authentication shell. Light, Dark, and System are explicit choices. Keep server-rendered markup stable until theme-dependent client values are available. Theme changes must update variables/classes without remounting the application or clearing form state.

Tune both palettes together: neutral surfaces, readable text, green primary/focus/accent, clear error and status colours, consistent borders and elevation. Check normal text contrast at 4.5:1 and large text at 3:1, plus distinguishable control boundaries and focus. Disabled controls must remain recognisable. Respect reduced motion.

## Enforcement and composition

The workspace selector uses a styled Base UI Menu for dismissal, keyboard navigation, positioning and focus management. Authentication, workspace and service screens compose shared fields, feedback, links, surfaces and layouts.

Scoped ESLint rules and the staged hook enforce composition in route and feature JSX/TSX outside `features/*/components`. Shared and feature component definitions may contain semantic HTML and Tailwind classes. The required root document HTML is exempt. Other lint checks still apply to feature components. Presentation changes preserve authentication, authorisation, transactions, validation, server entry points, migrations, URLs and service lifecycle.

## Regression requirements

- Preserve React Hook Form refs and events. Existing schemas and server validation remain authoritative. Base UI Field uses external validation state without introducing a competing validation flow.
- Preserve form names and values, autocomplete, required state, submission feedback, and `confirmed=yes` archive/restore semantics. Associate domain validation errors with their fields, map URL array errors to the textarea, and focus the first invalid control; keep permission and conflict errors at form level.
- Preserve service dirty input and its original version token together. Retain the slug/service ID component key. Theme changes and refreshed server props must not clear edits or permit stale overwrites.
- Workspace menu supports pointer and keyboard use, outside dismissal, Escape and focus return, current-workspace indication, route changes, long names, and small viewports. Keep explicit URLs and membership-checked navigation preferences.
- Composed Next links remain real links. Avoid nested anchors or buttons. Preserve one main landmark and meaningful heading levels.
- Tests use accessible menu trigger, menu and menuitem roles rather than removed native details/summary markup.
- Verify theme persistence, first load, system preference changes, keyboard menu behaviour, mobile overflow, and theme switching with an unsaved service form.

## References

- [Base UI styling](https://base-ui.com/react/handbook/styling)
- [Base UI composition](https://base-ui.com/react/handbook/composition)
- [Base UI Menu](https://base-ui.com/react/components/menu)
- [Base UI Field](https://base-ui.com/react/components/field)
- [next-themes](https://github.com/pacocoursey/next-themes)

Use APIs compatible with the installed Base UI version; online examples may describe a newer release.
