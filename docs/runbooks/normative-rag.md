# Normative RAG runbook

The normative repository is global platform content. Customer requests never supply an
`organizationId`; the authenticated tenant context is used only for access checks and content-free
retrieval logs.

## Local rollout

1. Start PostgreSQL/pgvector, Redis, MinIO, and Docling with `pnpm infra:up`.
2. Because the development migration history is now a clean baseline, reset disposable local data
   with `pnpm --filter @qhse/database exec prisma migrate reset --force`, then seed it.
3. Set `OPENAI_API_KEY`. Keep `NORMATIVE_RAG_ENABLED=false` until rights and source
   metadata have been reviewed.
4. Upload one licensed ISO source and one official Moroccan source. The UI requires explicit rights
   confirmations; database defaults remain false.
5. Process, review, classify, and validate each revision.
6. Set `NORMATIVE_RAG_ENABLED=true`. Create an inactive profile with
   `POST /v1/documents/embedding-profiles`, then call
   `POST /v1/documents/{documentId}/versions/{revisionId}/reindex`, and wait for its BullMQ job.
7. After every eligible chunk exists under the READY profile, call
   `POST /v1/documents/embedding-profiles/{profileId}/activate`.
8. Evaluate the synthetic French/Arabic dataset, then exercise `POST /v1/normative/search` from an
   authenticated customer session.

Activating a profile atomically retires the prior profile. Its vectors remain available for
rollback. A revision is returned only when it is published, human-validated, effective for the
requested date, visible, in the Morocco/global ISO scope, fully indexed under the active profile,
and permitted by every required rights flag.

## Diagnosing "L'analyse n'a pas abouti" in la veille réglementaire

The regulatory analysis runs against the **ACTIVE** profile only. Every reason it can be
unavailable is reported by a single endpoint:

```bash
curl -s --cookie "$ADMIN_COOKIE" https://<admin-api>/v1/documents/embedding-profiles | jq
```

`reason` is `null` when search is healthy; otherwise it is the same code the worker writes to
`RegulatoryAnalysisRun.errorCode`, and the customer UI renders its French translation:

| `reason`                          | Meaning                                                   | Fix                                                                                    |
| --------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `NORMATIVE_RAG_DISABLED`          | The **worker** does not see `NORMATIVE_RAG_ENABLED=true`. | Export it into the worker container; `compose.production.yaml` defaults it to `false`. |
| `OPENAI_KEY_MISSING`              | `OPENAI_API_KEY` is unset.                                | Set it, restart the worker.                                                            |
| `EMBEDDING_PROFILE_MISSING`       | The corpus was never indexed.                             | Run rollout steps 6–7.                                                                 |
| `EMBEDDING_PROFILE_BUILDING`      | Indexing is under way.                                    | Wait for the BullMQ jobs; check `missingChunks` per profile.                           |
| `EMBEDDING_PROFILE_NOT_ACTIVATED` | A profile is READY but step 7 was skipped.                | `POST /v1/documents/embedding-profiles/{profileId}/activate`.                          |
| `EMBEDDING_PROFILE_STALE`         | Content was published after the active profile was built. | Reindex the new revisions, then activate the refreshed profile.                        |

### Driving the rollout

`pnpm --filter @qhse/admin-api normative:index` performs steps 6-7 against whatever `DATABASE_URL`
points at. It is additive — it never deletes — and defaults to a read-only report:

```bash
pnpm --filter @qhse/admin-api normative:index             # report only
pnpm --filter @qhse/admin-api normative:index --index     # create profile + enqueue indexing
pnpm --filter @qhse/admin-api normative:index --activate  # activate once the worker has drained
```

`--index` reuses an existing BUILDING or READY profile rather than creating a second one, and skips
revisions that have no chunks yet — those need document processing first. `--activate` refuses
unless a READY profile already covers every searchable chunk.

Readiness is judged against exactly the revisions the retriever can return, so a READY profile
always satisfies the activation gate. Publishing new content after a profile reaches READY moves
it back to BUILDING on the next indexing job rather than stranding it.

## Removing a document while iterating (development only)

`DELETE /v1/documents/{documentId}` soft-deletes a dependency-free draft and keeps the audit
trail. To take a document out entirely — revisions, files and stored objects, provisions, chunks,
embeddings, processing and review history, relationships, activity, and any regulatory register
entry citing its provisions — use the purge, exposed in the admin UI as **Purge (dev)** on the
document detail page:

```bash
curl -X DELETE --cookie "$ADMIN_COOKIE" https://<admin-api>/v1/documents/<id>/purge | jq  # dry run
curl -X DELETE --cookie "$ADMIN_COOKIE" "https://<admin-api>/v1/documents/<id>/purge?confirm=true"
```

Without `confirm=true` it only reports what it would destroy. It requires the `delete` permission
(`super_admin` or `platform_admin`) and refuses when `NODE_ENV=production`. It is irreversible and
removes the audit trail, so it exists purely to make development iteration possible.

Purging content that an ACTIVE embedding profile had indexed leaves the profile complete — the
chunks are gone along with their embeddings — but a profile can be left covering nothing. Re-check
with `normative:index` after purging.

## Search request

```json
{
  "query": "Que demande la clause 4.1 ?",
  "asOf": "2026-08-08",
  "languages": ["fr", "ar"],
  "documentFamilies": ["standard", "regulation"],
  "limit": 10
}
```

Search logs contain a SHA-256 query hash, filters, source identifiers, profile, latency, and a safe
error code. They never contain the query, source text, or returned excerpts.

## Live OpenAI verification

The normal test suite never calls OpenAI. To verify the worker-to-pgvector-to-retriever path with a
locally configured key, run:

```bash
pnpm exec dotenv -e .env -- env TESTCONTAINERS_ENABLED=true OPENAI_LIVE_TESTS=true pnpm --filter @qhse/integration-tests exec vitest run normative-rag-openai.live.integration.test.ts
```

The test uses synthetic normative content and a disposable pgvector container. It checks the
768-dimensional document vector, embedding-profile readiness, hybrid retrieval, citation metadata,
and content-free retrieval logging, then removes the container.
