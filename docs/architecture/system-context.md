# System context

The customer web application calls one modular NestJS API. The API owns synchronous application
work and enqueues CPU- or latency-intensive operations in BullMQ. A separate NestJS worker consumes
those jobs. PostgreSQL is the system of record, pgvector stores tenant-filtered embeddings, Redis
backs queues, and S3-compatible storage holds evidence files. Docling is an isolated HTTP dependency.

Tenant identity is derived from the authenticated user and a verified organization membership. A
client-provided organization selection is never trusted without this membership lookup. Every
tenant-owned repository method requires `organizationId`, and database predicates include it.

API contracts are Zod schemas shared by clients and presentation layers. Prisma types stop at the
infrastructure boundary:

```text
Prisma record → domain/application model → Zod API contract
```
