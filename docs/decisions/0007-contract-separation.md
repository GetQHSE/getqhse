# ADR 0007: Separate database models and API contracts

**Status:** Accepted

Prisma models describe persistence, domain models describe business meaning, and Zod schemas describe
the public API. No Prisma model is exported to the web application. This prevents accidental data
exposure and lets storage evolve without silently changing the API.
