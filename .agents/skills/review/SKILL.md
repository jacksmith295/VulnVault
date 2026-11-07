---
name: review
description: Review VulnVault plans, code changes or pull requests for defects and missing verification.
---

# Review

`AGENTS.md` defines when independent review is required. Match depth and domain
references to the consequences of the change. An independent reviewer does not
need to commission a review of its own review.

## Select the scope

- **Plan:** assess behaviour, boundaries, ownership, failure paths and verification
  against agreed requirements.
- **Implementation:** inspect the diff and enough surrounding code to check
  correctness, permissions, integrity, regressions and maintainability. For
  documentation or skill changes, check accuracy, retained constraints and routing.
- **Existing PR:** inspect its published description, full diff against its target,
  discussions and head-specific checks. State inaccessible context.
- **Publication or handoff:** read [the published-PR workflow](references/published-pr.md).
  A completed independent review may supply the code assessment; inspect changes
  and publication evidence before relying on it.

## Evidence and boundaries

Report findings before changing reviewed files. Review alone does not authorise
repairs, commits, posting or merging. The implementation owner addresses findings;
assess fixes independently. If assigned implementation too, preserve any required
independent reviewer.

Check that verification exercises affected behaviour and important failures.
Distinguish tests you ran, reported local results and CI. Reuse applicable evidence
for unchanged code; missing or pending checks are not a pass.

Return actionable findings in severity order with locations, triggering scenarios
and consequences. Separate defects from suggestions and open questions. State
when no findings were identified and describe review limits. A clean assessment
does not establish untested behaviour or grant merge permission.
