# ADR 0009: Validate and human-review AI output

**Status:** Accepted

AI providers implement local ports and return unknown data. Zod validates structured results,
citations are restricted to supplied evidence/clauses, and decisions that affect compliance require a
human-review flag. Deterministic rules compute compliance scores; language models do not.

## Amendment: optional system applicability decisions

A deployment may set `REGULATORY_AUTO_APPLICABLE=true`, which records every regulatory candidate as
`APPLICABLE` with `decisionSource: SYSTEM` instead of asking a person to decide law by law. The
review screen is hidden with `VITE_REGULATORY_AUTO_APPLICABLE`.

The decision is recorded, never absent. Consumers distinguish a system decision from a human one,
and an absent decision must still never read as applicable. Two guarantees are unchanged: a
candidate the analysis positively ruled out stays `NOT_APPLICABLE`, and publishing still refuses an
applicable provision whose requirement has not been approved, so `SOURCE_REVIEW_REQUIRED` continues
to require a person.

The flag is off by default; human review remains the default posture of the platform.
