You are extending an existing QHSE platform monorepo. Do not recreate the workspace from scratch. Inspect the current repository first, preserve its conventions, and add a complete foundation for normative documents, legal texts, document extraction, embeddings, hybrid search, and controlled publication.

The existing stack is:

* pnpm workspaces
* Turborepo
* Vite + React + TypeScript
* NestJS + TypeScript
* Better Auth for customer authentication
* PostgreSQL
* Prisma
* pgvector
* BullMQ
* Redis
* MinIO/S3-compatible storage
* Docling as an isolated Python HTTP service
* Vitest
* Supertest
* Testcontainers
* Playwright
* Docker Compose
* Terraform

The platform must support two distinct document categories:

```text
GLOBAL_NORMATIVE
- ISO standards
- Moroccan NM standards
- Laws
- Dahirs
- Decrees
- Ministerial orders
- Official regulatory guidance
- Shared QHSE control libraries

TENANT_PRIVATE
- Customer procedures
- Quality manuals
- Policies
- Work instructions
- Internal regulations
- Audit evidence
- Certifications
- Corrective-action evidence
```

Global normative documents are managed only through the internal administration boundary. Customer users must never be allowed to create, replace, validate, publish, supersede, or re-embed global normative documents.

Tenant-private documents are uploaded from the customer application and must always be isolated using the authenticated organization context.

Do not implement a broad platform administration dashboard in this task. Implement only the backend modules, contracts, worker processes, database models, and a minimal internal normative-management interface required to upload, review, validate, publish, supersede, and monitor global normative content.

Create or extend the monorepo structure as follows:

```text
apps/
├── client-web/
├── client-api/
├── worker/
├── admin-api/
└── admin-web/                 # Minimal normative-management interface only

packages/
├── contracts/
├── api-client/
├── admin-api-client/
├── database/
├── domain/
├── knowledge/
├── config/
├── observability/
├── test-utils/
└── ui/

services/
└── docling/

tests/
├── api/
├── integration/
├── contracts/
├── security/
├── e2e/
└── fixtures/

evals/
├── normative-retrieval/
├── citation-correctness/
├── multilingual-retrieval/
├── version-selection/
└── hallucination-prevention/
```

Add a new shared package:

```text
packages/knowledge/
├── src/
│   ├── extraction/
│   ├── chunking/
│   ├── embeddings/
│   ├── retrieval/
│   ├── reranking/
│   ├── citations/
│   ├── providers/
│   └── index.ts
├── tests/
├── tsconfig.json
└── package.json
```

This package must contain provider-neutral interfaces and reusable knowledge-processing logic.

Add interfaces similar to:

```typescript
export interface DocumentExtractor {
  extract(input: ExtractDocumentInput): Promise<ExtractedDocument>;
}

export interface DocumentChunker {
  chunk(input: ChunkDocumentInput): Promise<DocumentChunk[]>;
}

export interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;

  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export interface NormativeRetriever {
  search(
    input: NormativeSearchInput,
  ): Promise<NormativeSearchResult[]>;
}

export interface RetrievalReranker {
  rerank(
    query: string,
    results: NormativeSearchResult[],
  ): Promise<NormativeSearchResult[]>;
}
```

The knowledge package must not contain:

* NestJS controllers
* Prisma repositories
* QHSE compliance scoring
* Diagnostic decisions
* Audit workflows
* Hardcoded prompts
* Provider secrets
* Direct dependencies on the frontend

Keep these concerns separated:

```text
Source documents
→ extraction
→ structured clauses and articles
→ semantic chunks
→ embeddings and retrieval
→ AI analysis
→ human validation
→ deterministic scoring
```

Do not place compliance conclusions or scores directly on normative clauses or chunks.

Use one PostgreSQL database initially, but logically separate the data using PostgreSQL schemas:

```text
auth
app
normative
retrieval
```

Use separate database roles where practical:

```text
client_api_role
admin_api_role
worker_role
migration_role
```

Recommended access model:

```text
client_api_role
- app schema: read/write within tenant rules
- normative schema: read published and entitled content
- retrieval schema: execute approved searches only
- cannot publish or modify global normative content

admin_api_role
- normative schema: manage global content
- retrieval schema: trigger controlled indexing operations
- limited access to app data

worker_role
- read source metadata
- write extraction results
- write chunks
- write embeddings
- update processing state
- cannot publish content

migration_role
- schema and migration privileges
- never used by running application containers
```

Do not create a separate normative database yet. Keep the implementation modular so the normative and retrieval schemas can later be extracted into a separate service and database without changing domain contracts.

Add or extend Prisma/database models for the following entities:

```text
NormativeSource
NormativeDocument
NormativeDocumentVersion
NormativeSection
NormativeProvision
NormativeRequirement
NormativeControl
NormativeChunk
NormativeEmbedding
ContentLicence
DocumentEntitlement
IngestionRun
ExtractionRun
ChunkingRun
EmbeddingRun
PublicationRevision
NormativeRelationship
RetrievalLog
```

Use `NormativeProvision` to represent either:

* ISO or NM clause
* Legal article
* Decree provision
* Definition
* Annex provision
* Table
* Note

Recommended relationships:

```text
NormativeDocument
└── NormativeDocumentVersion
    ├── NormativeSection
    │   └── NormativeProvision
    │       ├── NormativeChunk
    │       │   └── NormativeEmbedding
    │       └── NormativeRequirement
    │           └── NormativeControl
    ├── ContentLicence
    ├── DocumentEntitlement
    └── PublicationRevision
```

Do not store original PDF binary content inside PostgreSQL. Store original documents in MinIO/S3 and save only object metadata and references in PostgreSQL.

Every source document version must include fields equivalent to:

```typescript
type NormativeDocumentVersion = {
  id: string;
  documentId: string;

  identifier: string;
  title: string;
  edition?: string;
  language: 'ar' | 'fr' | 'en';
  jurisdiction: string;

  publicationDate?: Date;
  effectiveFrom?: Date;
  effectiveUntil?: Date;

  status:
    | 'draft'
    | 'processing'
    | 'review_required'
    | 'validated'
    | 'published'
    | 'superseded'
    | 'repealed'
    | 'archived';

  contentHash: string;
  sourceFileId: string;

  storageAllowed: boolean;
  extractionAllowed: boolean;
  embeddingsAllowed: boolean;
  aiProcessingAllowed: boolean;
  externalLlmAllowed: boolean;
  excerptDisplayAllowed: boolean;

  validationStatus:
    | 'pending'
    | 'under_review'
    | 'validated'
    | 'rejected';
};
```

Enforce content rights in application code. A document must not be extracted, embedded, sent to an AI provider, or displayed when the corresponding permission flag is false.

Create explicit domain errors such as:

```text
ContentStorageNotPermittedError
ContentExtractionNotPermittedError
EmbeddingNotPermittedError
AiProcessingNotPermittedError
ExternalLlmNotPermittedError
NormativeContentNotPublishedError
NormativeEntitlementRequiredError
```

Do not store embeddings directly on `NormativeChunk`.

Keep embeddings in a separate entity:

```typescript
type NormativeEmbedding = {
  id: string;
  chunkId: string;

  provider: string;
  model: string;
  dimensions: number;
  embeddingVersion: number;

  vector: number[];

  generatedAt: Date;
  isActive: boolean;
};
```

This must support multiple embedding models for the same chunk and allow controlled re-embedding without modifying the extracted source text.

Each chunk must include:

```typescript
type NormativeChunk = {
  id: string;
  documentVersionId: string;
  provisionId?: string;

  text: string;
  language: string;
  headingPath: string[];

  clauseNumber?: string;
  articleNumber?: string;

  pageStart?: number;
  pageEnd?: number;

  contentHash: string;
  chunkingStrategy: string;
  chunkingVersion: number;

  accessScope: 'global' | 'tenant_private';
  organizationId?: string;
};
```

Use semantic chunking based on document structure. Do not split only by fixed token count.

Prefer these chunk boundaries:

```text
One legal article
One standard clause
One sub-clause
One definition
One table with its heading and contextual text
One annex requirement
```

Include ancestor headings and relevant identifiers in the embedding input.

For example:

```text
ISO 9001:2015
Chapter 7 — Support
Clause 7.5 — Documented information
Clause 7.5.3 — Control of documented information
<provision text>
```

Implement the complete asynchronous processing pipeline:

```text
Admin uploads global normative PDF
        ↓
Admin API creates document version
        ↓
Original file stored in MinIO
        ↓
BullMQ ingestion job created
        ↓
Worker calls Docling
        ↓
Structured sections and provisions stored
        ↓
Semantic chunks generated
        ↓
Embeddings generated
        ↓
Full-text search index updated
        ↓
Status becomes REVIEW_REQUIRED
        ↓
QHSE expert validates extracted structure
        ↓
Authorized admin publishes content
        ↓
Content becomes available to client retrieval
```

Add BullMQ processors:

```text
normative-ingestion.processor.ts
normative-extraction.processor.ts
normative-chunking.processor.ts
normative-embedding.processor.ts
normative-reembedding.processor.ts
normative-indexing.processor.ts
normative-version-diff.processor.ts
normative-impact-analysis.processor.ts
```

Every job must include:

```text
jobId
documentVersionId
organizationId when tenant-private
correlationId
idempotencyKey
requestedBy
processingVersion
```

Jobs must be idempotent. Reprocessing the same document with the same extraction and chunking versions must not create duplicate sections, chunks, or embeddings.

Add processing states:

```text
UPLOADED
QUEUED
EXTRACTING
EXTRACTED
CHUNKING
CHUNKED
EMBEDDING
INDEXED
REVIEW_REQUIRED
VALIDATED
PUBLISHED
FAILED
SUPERSEDED
ARCHIVED
```

Persist processing history and failure details. Do not store sensitive source content in application logs.

Add NestJS modules to `admin-api`:

```text
normative-sources
normative-documents
normative-versions
normative-processing
normative-review
normative-publication
normative-licensing
normative-entitlements
normative-search-testing
health
```

Add endpoints similar to:

```text
POST   /admin/normative/documents
POST   /admin/normative/documents/:id/versions
POST   /admin/normative/versions/:id/upload
POST   /admin/normative/versions/:id/process
POST   /admin/normative/versions/:id/reprocess
POST   /admin/normative/versions/:id/reembed
GET    /admin/normative/versions/:id/status
GET    /admin/normative/versions/:id/provisions
PATCH  /admin/normative/provisions/:id
POST   /admin/normative/versions/:id/validate
POST   /admin/normative/versions/:id/publish
POST   /admin/normative/versions/:id/supersede
GET    /admin/normative/retrieval/test
```

The admin API must reject customer sessions and must not reuse customer authentication. Keep the admin authentication integration behind an interface. For this task, a development-only admin authentication adapter may be used, but production admin authentication must remain clearly marked as required and must not default to insecure public access.

Add a minimal `admin-web` interface for normative content management only.

Required pages:

```text
/admin/normative
/admin/normative/new
/admin/normative/:documentId
/admin/normative/versions/:versionId
/admin/normative/versions/:versionId/review
/admin/normative/versions/:versionId/retrieval-test
```

The interface must support:

* Uploading a normative PDF
* Entering metadata
* Configuring content-right flags
* Viewing processing status
* Viewing extraction failures
* Browsing sections and provisions
* Editing extraction mistakes
* Validating document structure
* Triggering reprocessing
* Triggering re-embedding
* Testing retrieval queries
* Publishing a validated version
* Superseding an older version

Do not make publication automatic after extraction.

Only content with this state may be used by production client searches:

```text
status = PUBLISHED
AND validationStatus = VALIDATED
AND effective date matches the requested audit date
AND licence rights permit the requested operation
AND the organization has the required entitlement
```

Extend `client-api` with read-only normative access:

```text
normative-search
applicable-requirements
normative-citations
document-entitlements
```

Recommended client endpoints:

```text
POST /normative/search
GET  /normative/documents/:id/metadata
GET  /normative/requirements/:id
GET  /audits/:auditId/applicable-requirements
```

The client API must never expose draft, processing, rejected, archived, or unauthorized normative content.

For customer-private documents, extend the existing client document upload flow.

Tenant-private processing flow:

```text
Customer uploads procedure or evidence
        ↓
organizationId taken from authenticated session
        ↓
File stored in tenant-scoped MinIO path
        ↓
Extraction and embeddings generated
        ↓
Content searchable only within that organization
```

Never trust an `organizationId` submitted by the frontend. Resolve the tenant from the authenticated session and enforce it in application services, repositories, retrieval filters, signed URLs, worker payloads, and background-job execution.

Implement hybrid retrieval using:

```text
PostgreSQL full-text search
+
pgvector semantic similarity
+
metadata filters
+
optional reranking interface
```

Retrieval must apply filters before or during search:

```text
organization and entitlement
access scope
document family
jurisdiction
language
effective date
publication status
document version
standard identifier
sector when available
```

Do not run unrestricted vector search across all global and tenant content.

A retrieval query should explicitly define its allowed scopes:

```typescript
type RetrievalScope = {
  includePublishedNorms: boolean;
  includePublishedControls: boolean;
  includeTenantDocuments: boolean;
  includeAuditEvidence: boolean;
  organizationId: string;
  auditId?: string;
};
```

Search results must preserve exact citations:

```typescript
type NormativeSearchResult = {
  chunkId: string;
  documentId: string;
  documentVersionId: string;

  identifier: string;
  title: string;

  clauseNumber?: string;
  articleNumber?: string;

  pageStart?: number;
  pageEnd?: number;

  language: string;
  text: string;

  keywordScore?: number;
  vectorScore?: number;
  rerankScore?: number;
};
```

The future AI-analysis logic must consume `NormativeSearchResult` through an interface. Do not couple the retrieval system to a specific diagnostic, scoring method, audit workflow, or LLM provider.

Preserve this boundary:

```text
NormativeRepository
- stores authoritative source knowledge

NormativeRetriever
- finds relevant content

AnalysisEngine
- proposes an interpretation

ScoringEngine
- applies deterministic business rules

AuditWorkflow
- manages human review and final decisions
```

Add database indexes for:

* Document identifier and edition
* Publication status
* Effective date ranges
* Language
* Jurisdiction
* Content hash
* Tenant organization
* Full-text search vectors
* pgvector similarity
* Active embedding model
* Clause and article identifiers

Use HNSW as the initial approximate vector index unless the current dataset is too small to justify it. Keep exact-search support for tests and small collections.

Add API contracts under:

```text
packages/contracts/src/normative/
├── documents.ts
├── versions.ts
├── provisions.ts
├── requirements.ts
├── processing.ts
├── publication.ts
├── licences.ts
├── entitlements.ts
├── search.ts
└── citations.ts
```

Add generated admin API client support under:

```text
packages/admin-api-client/
```

Do not share admin mutation contracts through the customer API client.

Add test fixtures:

```text
tests/fixtures/normative/
├── simple-standard.pdf
├── french-standard-sample.pdf
├── arabic-law-sample.pdf
├── multi-column-standard.pdf
├── table-heavy-standard.pdf
├── superseded-version.pdf
├── malformed-document.pdf
└── duplicate-document.pdf
```

Add unit tests for:

* Rights-policy enforcement
* Semantic chunk boundaries
* Content-hash generation
* Embedding-version activation
* Publication-state transitions
* Effective-version selection
* Citation construction
* Retrieval-result merging
* Idempotency-key generation

Add integration tests for:

* MinIO file upload
* Docling extraction
* PostgreSQL provision persistence
* pgvector embedding storage
* Full-text search
* Hybrid retrieval
* Re-embedding
* BullMQ retries
* Failed-processing recovery
* Publishing a validated version
* Superseding an older version

Add security tests verifying:

* Customer users cannot call admin normative endpoints
* Client API cannot publish global content
* Client API cannot re-embed global content
* Draft normative documents are never returned to customers
* One tenant cannot retrieve another tenant’s documents or embeddings
* Global content is returned only when entitlement permits it
* Signed source-file URLs respect permissions
* Restricted documents are never sent to external AI providers
* Retrieval logs do not expose sensitive full document content

Add normative retrieval evaluation datasets.

Measure:

```text
Recall@5
Recall@10
Citation precision
Wrong-version rate
Wrong-jurisdiction rate
Wrong-tenant rate
Unsupported-result rate
Multilingual retrieval quality
```

Include evaluation cases for:

* Search by exact ISO clause number
* Search by Moroccan legal article
* French query retrieving French normative content
* Arabic query retrieving Arabic legal content
* Semantic query where wording differs from the norm
* Audit-date query selecting the correct historical version
* Superseded norm not appearing as currently applicable
* Tenant-private document never appearing globally

Extend Docker Compose with any services and configuration required by the new admin API and minimal admin frontend.

Do not introduce:

* A separate vector database
* Elasticsearch
* Kubernetes
* Kafka
* Temporal
* A separate normative PostgreSQL database
* Fine-tuning on the normative corpus
* Automatic publication after extraction
* Automatic final compliance decisions

Update architecture documentation and add ADRs covering:

* Why normative content is a dedicated subsystem
* Why one PostgreSQL database with separate schemas is used initially
* Why chunks and embeddings are stored separately
* Why global and tenant-private corpora are separated
* Why extraction and indexing are asynchronous
* Why only validated and published normative content is searchable
* Why retrieval is independent from AI diagnostic logic
* How the subsystem can later move to a separate database or service

After implementation, provide:

1. The modified directory tree.
2. All created or modified database models.
3. The full ingestion and embedding flow.
4. Admin and client API endpoints.
5. Docker changes.
6. Environment-variable changes.
7. Migration commands.
8. Test commands.
9. Retrieval evaluation commands.
10. Known limitations.
11. Deferred admin-auth production configuration.
12. Confirmation of which commands were actually executed.

Do not claim that migrations, builds, tests, extraction, embeddings, or Docker services work unless they were actually executed.

The implementation is complete only when this vertical slice works:

```text
Internal normative administrator
→ uploads a licensed normative PDF
→ configures content rights
→ starts processing
→ worker stores the original in MinIO
→ Docling extracts its structure
→ semantic chunks are created
→ embeddings are stored in pgvector
→ administrator reviews and validates the structure
→ administrator publishes the document
→ customer API performs an entitled hybrid search
→ result returns the correct clause and page citation
→ tenant and publication security tests pass
```
