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
```

`dev:apps` starts both APIs, both web applications, and the processing worker.

Reset all local document-management state before retesting uploads and processing:

```bash
pnpm dev:reset-documents:dry # show database, queue, and object counts
pnpm dev:reset-documents     # clear document records, BullMQ jobs, and MinIO documents/
```

The reset preserves users, organizations, authentication data, and non-document objects. It refuses
to run in production or against non-local database, Redis, or S3 hosts.

Open `http://localhost:5174/documents`. MinIO receives immutable originals below
`documents/{documentId}/versions/{versionId}/original/`; signed URLs keep storage keys out of the
browser API contract. Derived extraction, OCR and preview assets use sibling prefixes.

## Lifecycle

1. An authorized manager creates a logical document and uploads its first immutable revision. The
   platform derives `r1`; Replace document derives `r2`, `r3`, and so on.
2. The browser calculates SHA-256; the API reports duplicate metadata with `409` unless a super
   administrator explicitly overrides it.
3. The API validates size, extension, MIME declaration and filename, then signs a five-minute S3
   upload. Upload confirmation verifies size and checksum metadata. File signatures and malware are
   queue stages and must be backed by production providers before production use.
4. `document-processing` creates one idempotent record per stage. The worker sends supported binary
   documents through the Docling HTTP boundary. Extraction preserves pages, uses page-preserving
   `pdftotext` as fallback, and applies French/Arabic OCR to scanned pages.
5. Processing ends in `review_required`. Automatic metadata and classification are never trusted as
   manual decisions. Blocking review issues prevent validation.
6. Validation evaluates the server-derived checklist. Publishing is a separate confirmed action;
   only it atomically updates `documents.current_version_id`. The previous revision remains current
   while a replacement is processed or reviewed.
7. Published content is immutable and is archived rather than deleted. Only dependency-free drafts
   may be soft-deleted.
8. Human-validated revisions with reviewed rights can be re-indexed through the embedding queue.
   Search additionally requires a complete active embedding profile.

## Provider integration

Implement `DocumentProcessingProvider` and `DocumentStorage` from the shared package. Providers must
be idempotent by processing-job key, preserve source locations, write derived data under the version
prefix, and return only locations/quality metadata to the database. Never place full content in audit
metadata or application logs.

Before production, replace the mock OCR, file-signature and malware providers, set strict bucket
lifecycle policies, and add formula-neutralized spreadsheet preview generation.
