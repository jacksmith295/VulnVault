# Accessibility review

## Scope and approach

This update targets [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/).
The audit covers the shared controls and layouts, public authentication,
workspace navigation, populated findings boards, services, groups, access
settings, and integrations in light and dark themes. No data model, permission,
or authentication policy changes are included.

The design keeps the green palette and existing proportions. Strong contrast
is applied to text, essential control boundaries, and focus indicators;
decorative card separators retain their quieter appearance.

## Findings and changes

| Finding | Change |
| --- | --- |
| Translucent focus rings could fall below 3:1 against their surroundings. The light 50% ring on white measured about 2.31:1. | Shared controls use an opaque 2px green outline with a gap. Menu/select highlights and board scrolling areas use inset outlines to prevent clipping. System Highlight colours are used in forced-colors mode. |
| Destructive-button hover backgrounds reduced small-text contrast below 4.5:1. | Reduce the tint strength. Calculated hover contrast is at least 4.77:1 in light mode and 5.40:1 in dark mode on the current application/card surfaces. |
| Outline buttons used a decorative border token in light mode. | Use the existing input-border token for the control boundary. Decorative card borders are unchanged. |
| The workspace switcher's accessible name omitted its visible workspace name. | Include the current name after “Switch workspace”. |
| Repeated headers had no skip navigation. | Add a keyboard-visible skip link and a focusable main target. Scroll padding helps focused controls stay below the sticky header. |
| Moving a finding could remove the focused menu trigger during refresh. | Announce the successful change and focus a persistent result message, including when the finding leaves the current filter. |
| Pages shared a generic browser title. | Add descriptive route titles using a consistent VulnVault suffix. |
| The framework's default missing-page surface bypassed the application theme. | Compose a themed 404 page with the shared main layout and navigation. |
| Short checkbox labels had a target height slightly below 24px. | Give the label a minimum height of 24px, preserving the compact checkbox itself. |

Text contrast and non-text contrast are different requirements. Normal text
needs 4.5:1, large text 3:1, and essential UI/state indicators 3:1 against
adjacent colours. Disabled controls and decorative borders have exceptions.
See [contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## Verification and limits

The Playwright accessibility suite uses axe against rendered pages and open
overlay states in both themes. It also checks validation associations, keyboard
skip navigation, focus return, status-change feedback, focus-outline contrast,
forced colours, and enlarged/spaced text. It uses only disposable records in
the separate test database. Existing browser regressions cover mobile
breakpoints, hidden board panels, dirty forms, reduced motion, and real overlay
transitions.

Run `npm run build` followed by
`npm run test:e2e -- tests/e2e/accessibility.spec.ts` for the focused suite,
or `npm run test:e2e` for all browser checks. See the README verification setup.
Finite transitions settle before axe scans; separate motion tests exercise
their intermediate states. No axe rule is suppressed to obtain a passing result.

Automated checks and browser inspection do not establish full WCAG conformance.
Human screen-reader testing with NVDA/Firefox and VoiceOver/Safari, operating
system text scaling, and touch/voice input remain manual follow-up checks.
Chromium forced-colors emulation does not replace checking Windows High Contrast
on a real device. The review does not claim certification.
