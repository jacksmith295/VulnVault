# Dependency advisory review

Reviewed on 2026-11-07 after removing unused `shadcn` and `tw-animate-css` dependencies. Two underlying advisories remain open; neither is classified as a false positive.

## Audit results

The audit reports 12 affected dependency entries, all moderate, propagating two underlying advisories. Before removal it reported 17 entries across three advisories. These counts do not establish application exploitability. The lockfile contains 132 fewer packages; no retained package version was changed.

`npm audit --omit=dev` reports four moderate entries, all from the esbuild chain below. Although `drizzle-kit` is a direct development dependency, `better-auth@1.7.16` also declares it as an optional peer. npm marks this chain `devOptional`, so it remains in that audit. Production-only audit output alone does not establish which code the running application executes.

## Remaining advisories

### minimatch globparts amplification

[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) affects `>=7.0.0 <11.0.1`; the first patched release is `11.0.1`.

Installed paths:

- `eslint-config-next@16.4.5 → typescript-eslint@8.72.1 → @typescript-eslint/typescript-estree@8.72.1 → minimatch@10.2.6`

The advisory requires attacker-controlled patterns with `optimizationLevel >= 2`. Inspected consumer calls use default options or `{ dot: true }`; no enabling configuration was found. This narrows observed exposure without proving safety in every path. The remaining parent requires major 10, so the patched major is outside their declared ranges.

Revisit when those parents support a patched version, or when tooling begins accepting untrusted patterns. Verify lint and type checking after an upgrade.

### esbuild development server exposure

[Upstream GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) affects `<=0.24.2`; patched versions start at `0.25.0`.

Installed path: `drizzle-kit@0.31.11 → @esbuild-kit/esm-loader@2.6.5 → @esbuild-kit/core-utils@3.3.2 → esbuild@0.18.20`.

The advisory concerns esbuild serving. Inspected core-utils calls use transformation APIs; no serving calls were found there. This is limited call-path evidence, not a zero-risk claim. Its `~0.18.20` range excludes the patch.

Revisit when Drizzle replaces the deprecated loader or supports patched esbuild, or before introducing esbuild serving. Verify migration generation and isolated migration execution after tooling changes.

## Removed dependency path

Removing `shadcn` eliminates the installed `deepmerge@4.3.1` chain for [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). It also removes the `ts-morph` path to minimatch, while ESLint's path remains. This is dependency removal, not an upstream patch or a finding-lifecycle change.

The application uses Tailwind's built-in data-state variants and pulse animation, plus its own feedback keyframes and overlay transitions. No replacement CSS package is required. Browser checks must preserve checked controls, active tabs, disabled menu items, skeletons and motion in both themes. The unused component-generator configuration was removed with the CLI.

## Decision

Keep retained dependencies and authentication pinned. Do not use force fixes, suggested major downgrades, or global major overrides to clear counts. Future authentication upgrades require the [authentication hardening review and PostgreSQL regressions](auth-hardening.md). Repeat both audits after dependency changes and record remaining advisories separately from verification results.
