---
name: review
description: Independently review VulnVault plans, code changes, or pull requests for defects and missing verification.
---

# Review

## Select the scope

- **Plan:** assess proposed behaviour, boundaries, ownership, failure paths and
  verification against the agreed requirements.
- **Implementation:** inspect the diff and enough surrounding code to check
  correctness, permissions, integrity, regressions and maintainability.
- **Existing PR:** inspect the current published description, full diff against
  its target, discussions and head-specific checks. State inaccessible context.
- **PR publication or handoff:** also read [the published-PR workflow](references/published-pr.md).
  Its posting steps apply only when the user or repository workflow authorises
  submission, including follow-up submissions after fixes.

Match depth and domain references to the change. An assigned independent reviewer
fulfils that role directly; it need not commission a review of its own review.
`AGENTS.md` retains the independent plan, implementation and fresh published-PR
review requirements.

## Review without taking over implementation

Report findings before changing reviewed files. A review assignment alone does
not authorise repairs, commits, posting or merging. The implementation owner
addresses findings; assess their fixes independently. If explicitly assigned
implementation too, preserve the required independent reviewer.

Check that verification exercises changed behaviour and important failure paths.
Distinguish tests you ran, reported local results and CI; missing or pending
checks are not a pass.

Return actionable defects in severity order, with locations, triggering scenarios
and consequences. Separate defects from suggestions or open questions. State when
no findings were identified and describe review limits. A clean review does not
prove untested behaviour or authorise a merge; existing user authorisation remains
governed by `AGENTS.md` and the current task.
