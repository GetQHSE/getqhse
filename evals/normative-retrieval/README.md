# Normative retrieval evaluations

The committed dataset uses synthetic ISO-like clauses and synthetic French/Arabic legal articles.
Licensed ISO source text must remain outside Git.

Run retrieval against a seeded environment and calculate:

- exact-reference top-three rate;
- semantic Recall@5 (gate: at least 90%);
- citation precision (gate: 100%);
- wrong revision, unpublished, unauthorized, and wrong-jurisdiction rates (gate: zero);
- warm-search p95 latency (gate: below 2.5 seconds in staging).

OpenAI calls are opt-in. Normal unit and integration tests use deterministic vectors.
