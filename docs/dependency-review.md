# Dependency advisory review

Reviewed on 2026-11-07. These advisories remain open. This slice does not fix them or classify them as false positives.

## Audit results

The clean-install audit reports 17 affected dependency entries: 15 moderate and two low. Those entries propagate three underlying advisories through their parent packages. They are not 17 independent vulnerabilities, and the counts do not establish application exploitability.

`npm audit --omit=dev` reports four moderate entries, all from the esbuild chain below. Although `drizzle-kit` is a direct development dependency, `better-auth@1.7.16` also declares it as an optional peer. npm marks this chain `devOptional`, so it remains in that audit. Production-only audit output alone does not establish which code the running application executes.

## Remaining advisories

### minimatch globparts amplification

[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) affects `>=7.0.0 <11.0.1`; the first patched release is `11.0.1`.

Installed paths:

- `eslint-config-next@16.4.5 → typescript-eslint@8.72.1 → @typescript-eslint/typescript-estree@8.72.1 → minimatch@10.2.6`
- `shadcn@4.23.0 → ts-morph@26.0.0 → @ts-morph/common@0.27.0 → minimatch@10.2.6`

The advisory requires attacker-controlled patterns with `optimizationLevel >= 2`. Inspected consumer calls use default options or `{ dot: true }`; no enabling configuration was found. This narrows observed exposure without proving safety in every path. Both parents require major 10, so the patched major is outside their declared ranges.

Revisit when those parents support a patched version, or when tooling begins accepting untrusted patterns. Verify lint, type checking, and affected component-generation workflows after an upgrade.

### deepmerge prototype poisoning

[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) affects `>=4.2.0 <=4.3.1`; no patched release is published.

`shadcn@4.23.0` requires `deepmerge@4.3.1` directly and through `@shadcn/registry@0.2.1`. Exposure depends on malicious source objects reaching merge operations. Application use of shadcn is its CSS export; the CLI and registry merge paths were not exhaustively reviewed.

Retain shadcn: `src/app/globals.css` imports `shadcn/tailwind.css`, and shared components use its variants. Revisit when upstream patches or replaces deepmerge, or before using untrusted registries. Any dependency removal needs a deliberate CSS replacement and browser verification.

### esbuild development server exposure

[Upstream GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) affects `<=0.24.2`; patched versions start at `0.25.0`.

Installed path: `drizzle-kit@0.31.11 → @esbuild-kit/esm-loader@2.6.5 → @esbuild-kit/core-utils@3.3.2 → esbuild@0.18.20`.

The advisory concerns esbuild serving. Inspected core-utils calls use transformation APIs; no serving calls were found there. This is limited call-path evidence, not a zero-risk claim. Its `~0.18.20` range excludes the patch.

Revisit when Drizzle replaces the deprecated loader or supports patched esbuild, or before introducing esbuild serving. Verify migration generation and isolated migration execution after tooling changes.

## Decision

No compatible upstream fix was identified. Keep dependencies and authentication pinned. Do not use force fixes, suggested major downgrades, or global major overrides to clear counts. Future authentication upgrades require the [authentication hardening review and PostgreSQL regressions](auth-hardening.md). Repeat both audits after dependency changes and record remaining advisories separately from verification results.
