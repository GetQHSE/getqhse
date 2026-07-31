# Document management

`@qhse/documents` owns provider-neutral validation, permissions, processing contracts, upload
security rules, and lifecycle transitions for platform knowledge sources. Prisma repositories and
NestJS controllers remain in `admin-api`; React screens remain in `admin-web`.

## Local setup

```bash
cp .env.example .env
pnpm infra:up
pnpm exec dotenv -e .env -- pnpm db:deploy
pnpm exec dotenv -e .env -- pnpm db:seed
pnpm dev:apps
pnpm --filter @qhse/worker dev
```

Open `http://localhost:5174/documents`. MinIO receives immutable originals below
`documents/{documentId}/versions/{versionId}/original/`; signed URLs keep storage keys out of the
browser API contract. Derived extraction, OCR and preview assets use sibling prefixes.

## Lifecycle

1. An authorized manager creates a logical document and immutable version.
2. The browser calculates SHA-256; the API reports duplicate metadata with `409` unless a super
   administrator explicitly overrides it.
3. The API validates size, extension, MIME declaration and filename, then signs a five-minute S3
   upload. Upload confirmation verifies size and checksum metadata. File signatures and malware are
   queue stages and must be backed by production providers before production use.
4. `document-processing` creates one idempotent record per stage. OCR is skipped for reliable
   extractable text. The bundled worker is deliberately a mock provider boundary and marks all
   generated suggestions for review.
5. Processing ends in `review_required`. Automatic metadata and classification are never trusted as
   manual decisions. Blocking review issues prevent validation.
6. Validation evaluates the server-derived checklist. Publishing is a separate confirmed action;
   only it updates `documents.current_version_id` and makes a version eligible downstream.
7. Published content is immutable and is archived rather than deleted. Only dependency-free drafts
   may be soft-deleted.

## Provider integration

Implement `DocumentProcessingProvider` and `DocumentStorage` from the shared package. Providers must
be idempotent by processing-job key, preserve source locations, write derived data under the version
prefix, and return only locations/quality metadata to the database. Never place full content in audit
metadata or application logs.

Before production, replace the `mock` extraction, OCR, file-signature and malware providers, set
strict bucket lifecycle policies, and add formula-neutralized spreadsheet preview generation.
