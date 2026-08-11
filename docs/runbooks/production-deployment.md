# Production deployment

The production deployment is a standard Docker Compose application. Dokploy supplies source checkout,
build orchestration, HTTPS routing, runtime secrets, and deployment history; none of the application
containers import or call Dokploy APIs.

## Topology

Create one Dokploy project with:

- managed PostgreSQL, Redis, and S3-compatible object storage services with persistent storage;
- one Compose application sourced from this repository and `compose.production.yaml`;
- public routes for `client-web:80`, `client-api:3000`, `admin-web:80`, and `admin-api:3001`;
- no public routes for `worker`, `docling`, `migrate`, PostgreSQL, Redis, or object storage administration.

Use these DNS names, replacing `example.com`:

| DNS name                | Compose service   |
| ----------------------- | ----------------- |
| `app.example.com`       | `client-web:80`   |
| `api.example.com`       | `client-api:3000` |
| `admin.example.com`     | `admin-web:80`    |
| `admin-api.example.com` | `admin-api:3001`  |

Create all four DNS records before enabling HTTPS. Require HTTPS and do not publish the internal
Compose ports directly from the VPS firewall.

## First deployment

1. Provision PostgreSQL, Redis, and object storage in Dokploy. Use separate application and migration
   PostgreSQL roles. The migration role owns schema changes; the application role has runtime access.
2. Make those services reachable from the Compose application through private addresses or Dokploy's
   shared private network. Do not use public database ports.
3. Copy every variable from `.env.production.example` into the Compose environment and replace all
   example domains, credentials, and `replace-me` values. Generate a random `BETTER_AUTH_SECRET` of at
   least 32 characters. Keep `COOKIE_SECURE=true`, which is fixed by the Compose definition.
4. Set resource limits to fit the VPS. Docling is the largest workload; do not allocate the defaults
   unless the host has sufficient memory and CPU.
5. Configure the Compose application to build `compose.production.yaml` from `main`. Disable Dokploy's
   direct push auto-deploy so an unverified commit cannot bypass CI.
6. Deploy once. The `migrate` container runs `prisma migrate deploy`; the APIs and worker start only
   after it exits successfully. A failed migration prevents the dependent services from starting.
7. Bootstrap the first administrator exactly once:

   ```bash
   docker compose --env-file .env.production -f compose.production.yaml run --rm migrate pnpm db:seed
   ```

   Remove the bootstrap password from Dokploy after confirming sign-in. Later deployments never seed.

8. Configure each public route in Dokploy and verify:

   ```bash
   curl --fail https://api.example.com/health/ready
   curl --fail https://admin-api.example.com/health/ready
   curl --fail https://app.example.com/healthz
   curl --fail https://admin.example.com/healthz
   ```

## Gated automatic deployment

Create a GitHub environment named `production`, restrict it to `main`, and add the encrypted secret
`DOKPLOY_DEPLOY_WEBHOOK`. The `Deploy production` job calls this webhook only after `CI gate` succeeds.
The production concurrency group permits only one deployment at a time.

The Dokploy webhook must target this Compose application and its `main` branch. Keep any separate
"deploy on push" setting disabled; otherwise it bypasses the GitHub gate.

## Release and rollback

- Review migration SQL for backward compatibility before merge. Deploy additive schema changes before
  code that requires them; defer destructive schema removal to a later release.
- After deployment, check all four health URLs, worker logs, failed BullMQ jobs, and migration output.
- For an application rollback, select the previous successful commit in Dokploy and redeploy it.
- Do not reverse a production migration automatically. If a migration is incompatible, roll the app
  forward with a corrective migration or follow a separately reviewed database recovery procedure.
- If the Dokploy host is replaced, clone the repository on any Docker Compose host, restore data,
  supply the same environment variables, and run `docker compose -f compose.production.yaml up -d`.

## Required security settings

- Permit inbound VPS traffic only for SSH, HTTP, and HTTPS; restrict SSH by key and source where possible.
- Use exact CORS origins, HTTPS auth URLs, secure cookies, and unique production credentials.
- Keep PostgreSQL, Redis, Docling, the worker, and object storage administration private.
- Send application email through a production SMTP provider; do not deploy Mailpit.
- Store secrets in Dokploy/GitHub, never in repository files or Docker build arguments except public
  `VITE_*` values, which are intentionally embedded in browser bundles.

See [backup and restore](./backup-restore.md) before accepting production data.
