# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, if it exists.
- **`docs/decisions/`**: read ADRs that touch the area you're about to work in. This repo uses `docs/decisions/` (not `docs/adr/`) for numbered ADRs — see `0001-modular-monolith.md` through `0010-version-policy.md`.

If `CONTEXT.md` doesn't exist yet, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates it lazily when terms or decisions actually get resolved.

## File structure

Single-context (this repo, despite being a pnpm workspace — apps/, packages/, and services/ are one product, not separate bounded contexts):

```
/
├── CONTEXT.md
├── docs/decisions/
│   ├── 0001-modular-monolith.md
│   └── ...
├── apps/
├── packages/
└── services/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR in `docs/decisions/`, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0008 (tenant isolation), but worth reopening because…_
