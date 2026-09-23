# ADR 0009: Validate and human-review AI output

**Status:** Accepted

AI providers implement local ports and return unknown data. Zod validates structured results,
citations are restricted to supplied evidence/clauses, and decisions that affect compliance record
whether they came from a person or the system. Deterministic rules compute compliance scores;
language models do not.

## Amendment: automatic applicability and publication

Regulatory discovery now records system applicability decisions and publishes the resulting register
without a candidate-by-candidate review screen. The decision is recorded as `SYSTEM`, never inferred
from an absent decision. A candidate ruled out by the analysis remains `NOT_APPLICABLE`; an ingested
provision without a verified requirement cannot be published as applicable. A discovered law can be
published at law level while its article wording and source remain visibly subject to verification.

Automatic publication is the default. Deployments can explicitly set both
`REGULATORY_AUTO_APPLICABLE=false` and `VITE_REGULATORY_AUTO_APPLICABLE=false` to retain the manual
review workflow. Manual decisions and the analysis-quality review remain available in that mode.
