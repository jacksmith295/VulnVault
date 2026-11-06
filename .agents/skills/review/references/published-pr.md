# Published PR review and handoff

Use this workflow when a PR handoff or posted review is authorised by the user or
repository rules. A request for review findings alone does not authorise posting,
including follow-up reviews.

## Inspect the published result

Complete independent implementation review before opening a PR. After publication,
use a fresh reviewer who did not implement the changes, as required by `AGENTS.md`.
Read the published description, full diff, relevant discussions and check results;
record repository, PR number, head SHA and target branch/base commit. Assess any
unresolved earlier findings. Check evidence for this head, not an older commit.

Before submission, recheck the head and target. If they changed, assess the updated
diff and checks before posting. Anchor the review to the reviewed head when the
tool supports it. Distinguish local results from CI and treat absent, inaccessible,
pending or failed checks accurately.

## Submit only the supported outcome

- Use `APPROVE` only when review is complete, required checks passed and no
  unresolved defects or blocking requests remain.
- Use `COMMENT` for findings or incomplete evidence, with actionable locations
  and missing verification. Also use it if GitHub prevents author self-approval
  or the account cannot approve. Do not change identity to bypass that restriction
  or describe a comment as a GitHub approval.
- After fixes, reassess the updated diff and affected checks. When posting remains
  authorised, submit a follow-up stating what was resolved and what remains.

Report the posted review link and outcome. If posting fails, say so and provide
the review text; an attempted submission is not a posted review.

## Handoff

Give one evidence-based recommendation for the reviewed head:

| Recommendation | Condition and next action |
| --- | --- |
| Ready for your merge approval | Review and required checks complete, no unresolved blocker. Separate optional follow-ups. |
| Return to development | Defects, unmet scope or missing implementation/tests need code changes; name the blockers. |
| Wait for verification | No confirmed code blocker, but checks or review evidence remain incomplete; name what must complete. |

A comment required by the self-approval restriction may still support a ready
recommendation. New commits require an updated assessment. A review recommendation
does not grant merge permission; honour existing task-specific user merge
authorisation rather than asking again when it has already been given.
