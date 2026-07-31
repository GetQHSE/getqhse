# ADR 0010: Dependency version policy

**Status:** Accepted

Registry versions were checked on 2026-07-30 and installed with pnpm. The foundation uses React
19.2.8, Vite 8.2.0, NestJS 11.1.28, Prisma 7.9.1, Better Auth 1.6.25, Turborepo 2.10.7, Vitest
4.1.10, and pnpm 11.14.0.

TypeScript 7.0.2 was current, but `typescript-eslint` 8.65.0 declares support below TypeScript 6.1.
TypeScript 6.0.3 is therefore the latest compatible choice. Node 24.17.0 satisfies current Vite and
Prisma engines. Python packages are pinned to Docling 2.117.0, FastAPI 0.141.1, Uvicorn 0.52.0,
Pydantic Settings 2.14.2, and python-multipart 0.0.32.

The workspace uses the latest Node 24 type definitions (24.13.3) rather than Node 26 definitions so
compile-time platform APIs match the declared and containerized Node 24 runtime.

BullMQ 6.0.0 was current, but `@nestjs/bullmq` 11.0.4 supports BullMQ through 5.x. BullMQ 5.81.3 is
therefore the latest compatible queue runtime.

Container tags checked against Docker Hub are PostgreSQL 18 with pgvector 0.8.6, Redis 8.8.1,
Mailpit 1.30.6, and stable nginx 1.30.4. Local builds use the installed Node 24.17 line. These tags
are pinned for repeatability; production deployment metadata should pin their immutable digests.

Renovate or Dependabot should propose lockfile updates after CI is stable. Production images must use
immutable digests in the deployment repository.
