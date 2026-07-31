# Local development runbook

1. Copy `.env.example` to `.env` and replace local secrets.
2. Start dependencies with `pnpm infra:up`.
3. Apply committed migrations with `pnpm exec dotenv -e .env -- pnpm db:deploy`, then seed with
   `pnpm exec dotenv -e .env -- pnpm db:seed`.
4. Start the client/admin APIs and web applications with `pnpm dev:apps`. Use `pnpm dev` to also
   start other workspace development processes such as the worker.
5. Open the web app on port 5173, API docs on port 3000, Mailpit on port 8025, and MinIO on port 9001.

When creating or validating a migration, run `pnpm exec dotenv -e .env -- pnpm db:migrate`.
Prisma uses the disposable `qhse_shadow` database initialized by Compose for drift detection.

For a fully containerized environment run `pnpm infra:full`. Stop it with `pnpm infra:down`.
