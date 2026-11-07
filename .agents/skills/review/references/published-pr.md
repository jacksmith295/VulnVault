# Published PR review and handoff

Posting requires user or repository-workflow authorisation. A request for findings
alone does not authorise submission or follow-up comments.

## Assess the published result

Record the repository, PR number, head SHA and target/base commit. Inspect the
description, diff, relevant discussions, unresolved findings and head-specific checks.

Use an identifiable completed independent review when it covers the relevant code
and base. Compare that reviewed result with the published diff; assess any new
changes and base interactions. Publication does not require a fresh reviewer or
another full code review solely because the PR now exists. Missing or incomplete
prior review, substantive changes or material base interactions require further
substantive independent review before handoff.

Recheck head and target before submission. If either changed, assess the updated
diff and verification before posting. Anchor the comment to the reviewed head
where supported. Attribute local and CI evidence accurately; absent, pending,
inaccessible or failed checks remain incomplete verification.

## Submit the assessment

- Always use `COMMENT`. State **Agent review: approved** only when review is complete,
  required checks passed and no unresolved blockers remain. Otherwise give findings
  or missing verification. Do not repeat platform approval limitations.
- Explain the change-specific assessment: paths or instructions examined, resulting
  behaviour, retained safeguards and relevant verification. Cite useful locations
  and scale detail to the change; a generic claim that the diff was reviewed is insufficient.
- After fixes, reassess affected changes and checks. When posting remains authorised,
  submit a follow-up explaining what was resolved and what remains.

Report the posted review link. If posting fails, provide the review text and say it
was not posted.

## Handoff

Give one recommendation for the reviewed head:

| Recommendation | Condition and next action |
| --- | --- |
| Ready for your merge approval | Review and required checks complete, with no unresolved blocker. Separate optional follow-ups. |
| Return to development | Defects or unmet scope require changes; name the blockers. |
| Wait for verification | No confirmed code blocker, but checks or review evidence are incomplete; name what must complete. |

New commits require an updated assessment. Honour existing task-specific merge
authorisation; a review recommendation alone does not grant it.
