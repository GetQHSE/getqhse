# ADR 0009: Validate and human-review AI output

**Status:** Accepted

AI providers implement local ports and return unknown data. Zod validates structured results,
citations are restricted to supplied evidence/clauses, and decisions that affect compliance require a
human-review flag. Deterministic rules compute compliance scores; language models do not.
