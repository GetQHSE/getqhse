# QHSE Platform foundation

A pnpm/Turborepo foundation for a multi-tenant, AI-assisted QHSE audit platform. It intentionally
implements only representative vertical slices: shared contracts and domain rules, Better Auth and
tenant context, a layered sites module, queue processors, a feature-oriented React shell, Docling's
HTTP boundary, real-service test infrastructure, and deployment placeholders.

## Requirements

- Node.js 24.17 or later
- pnpm 11.14 or later (use Corepack)
- Docker with Compose
- Python is not required locally unless running Docling outside Docker
- k6 and Terraform are optional for their respective checks

Do not use npm in this repository.

## Install and run

```bash
pnpm install
cp .env.example .env
pnpm infra:up
pnpm exec dotenv -e .env -- pnpm db:deploy
pnpm exec dotenv -e .env -- pnpm db:seed
pnpm dev:apps
```

The seed bootstraps `BOOTSTRAP_SUPER_ADMIN_EMAIL` with the configured password only when the
database has no `super_admin`. Change the example password before using the account outside local
development. Subsequent seed runs do not reset an existing super admin's credentials.

Use `pnpm exec dotenv -e .env -- pnpm db:migrate` only when creating or validating migrations
during development. It uses the disposable `qhse_shadow` database initialized by Compose.

For a full container build use `pnpm infra:full`.

## Quality and tests

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:coverage
pnpm test:contracts
pnpm test:api
TESTCONTAINERS_ENABLED=true pnpm test:integration
pnpm test:security
pnpm test:e2e
DOCLING_INTEGRATION_URL=http://localhost:8000 pnpm test:docling
k6 run tests/performance/smoke.js
```

Integration and API tests use real PostgreSQL, Redis, and MinIO through Testcontainers or
`compose.test.yaml`; SQLite and in-memory infrastructure substitutes are not supported.

## Services and ports

| Service             | Port | Purpose                             |
| ------------------- | ---: | ----------------------------------- |
| client-web          | 5173 | Customer React application          |
| client-api          | 3000 | Customer API and `/docs` OpenAPI UI |
| admin-web           | 5174 | Platform administration application |
| admin-api           | 3001 | Platform administration API         |
| PostgreSQL/pgvector | 5432 | Transactional and vector storage    |
| Redis               | 6379 | BullMQ                              |
| MinIO API           | 9000 | S3-compatible object storage        |
| MinIO console       | 9001 | Local object-storage administration |
| Docling             | 8000 | Document extraction HTTP boundary   |

Test Compose publishes isolated services on 55432, 56379, 59000, and 59001.

## Architecture

- A modular monolith keeps transactions and authorization straightforward.
- The worker and Docling are separate processes because their runtime/scaling profiles differ.
- Tenant identity comes from a Better Auth session plus verified membership, never from a raw request
  body.
- Better Auth handles identity; QHSE permissions are maintained independently.
- Every tenant-owned table and repository predicate carries `organizationId`.
- Prisma records are never frontend contracts.
- Compliance scoring is deterministic and excludes non-applicable requirements.
- AI outputs are schema-validated, citation-bounded, and human-reviewed.

See `docs/decisions` and `docs/security/tenant-isolation.md` for the complete rationale.

## Manual configuration

- Generate strong Better Auth, PostgreSQL, and object-storage credentials.
- Configure the Brevo API key and transactional template IDs in Administration → Settings → Emails.
- Choose a cloud provider and implement the Terraform module resources/backends.
- Configure production CORS origins, HTTPS, secure cookies, DNS, observability, and secrets storage.
- Add provider credentials only for opt-in evaluation or worker runs; standard tests never call paid
  AI APIs.
- Generate and commit `apps/client-api/openapi.json` after changing API presentation contracts.

## Intentionally deferred

- Product-complete modules and UI flows beyond the representative sites slice.
- Brevo template authoring remains external to GetQHSE; only IDs and typed parameters are managed here.
- Database-backed tenant tests for resources that do not yet have implementations.
- Full object-storage upload/signing and file malware scanning.
- Production report rendering and notification delivery.
- Provider-specific Terraform, RLS policies, backup/restore automation, and SLO dashboards.
- Chat generation, tenant-private RAG, prompt versioning, and production-scale quality datasets.
- Load, stress, and soak profiles beyond the k6 smoke test.
- Route-level frontend code splitting; the initial representative shell currently emits a 534 kB
  minified JavaScript bundle.

Commits should follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).

Production uses the portable `compose.production.yaml` definition; Dokploy is the initial control plane,
not an application dependency. See the [production deployment](docs/runbooks/production-deployment.md),
[backup and restore](docs/runbooks/backup-restore.md), and
[GitHub workflow](docs/runbooks/github-workflow.md) runbooks.
