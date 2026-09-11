# Normative RAG runbook

Regulatory analysis now uses the [MVP law catalog](law-catalog.md) directly.
The embedding setup below is only required for the separate normative search endpoint.

The normative repository is global platform content. Customer requests never supply an
`organizationId`; the authenticated tenant context is used only for access checks and content-free
retrieval logs.

## Local rollout

1. Start PostgreSQL/pgvector, Redis, MinIO, and Docling with `pnpm infra:up`.
2. Because the development migration history is now a clean baseline, reset disposable local data
   with `pnpm --filter @qhse/database exec prisma migrate reset --force`, then seed it.
3. Set `OPENAI_API_KEY`. Keep `NORMATIVE_RAG_ENABLED=false` until rights and source
   metadata have been reviewed. Both are the fallback layer: the administration workspace's
   **Settings → LLM** tab overrides them per environment without a redeploy (see
   [LLM settings](#llm-settings)).
4. Upload one licensed ISO source and one official Moroccan source. The UI requires explicit rights
   confirmations; database defaults remain false.
5. Process, review, classify, and validate each revision.
6. Enable retrieval — `NORMATIVE_RAG_ENABLED=true`, or the switch in Settings → LLM. Create an
   inactive profile with
   `POST /v1/documents/embedding-profiles`, then call
   `POST /v1/documents/{documentId}/versions/{revisionId}/reindex`, and wait for its BullMQ job.
7. After every eligible chunk exists under the READY profile, call
   `POST /v1/documents/embedding-profiles/{profileId}/activate`.
8. Evaluate the synthetic French/Arabic dataset, then exercise `POST /v1/normative/search` from an
   authenticated customer session.

## Document extraction quality

The extractor runs one Docling pass per document, then measures the text it produced. A PDF can
carry a text layer that decodes to nothing recoverable -- subsetted CID fonts with no ToUnicode
CMap map every glyph to an arbitrary code point -- and Docling's default OCR mode is PDF-aware,
so it skips regions that already hold text cells and never OCRs those pages. The result is a
document that passes every character-count check and reaches review as unusable garbage.

The decisive measurement is lexical. Docling's parser rebuilds word spacing from the page
geometry, so a broken text layer still comes back with ordinary-looking words of ordinary length
-- "Article" simply arrives as "$UWLFOH". On the two documents in `tests/factories`, function
words run at 0.03 per thousand characters for the broken law against 39 for a cleanly extracted
standard; spacing, word length and character class are indistinguishable between them.

When the measured text layer is degenerate (no recognizable words, control characters where
spaces belong, word spacing lost, words running together, undecodable characters), the document
is converted a second time
with `OcrMode.FULL_PAGE`. The second pass is kept only if it is both assessable and no longer
degenerate; a failed or worse pass leaves the first conversion untouched. Set
`DOCLING_REPAIR_DEGENERATE_TEXT_LAYER=false` to restore the single-pass behaviour.

The OCR engine is named explicitly as Tesseract with `DOCLING_OCR_LANGUAGES` (default `fra+ara`).
Docling's automatic engine selection defers to whichever engine it picks, and every one of those
defaults to European languages only -- Arabic sources were being recognized as French.

Docling's own confidence report is not a substitute for any of this: the broken law converts with
`confidence_mean_grade = excellent`, because its layout and parse stages both succeeded. Only the
character mapping behind them failed.

Section-header depth is inferred from PDF bookmarks and outline numbering
(`DOCLING_INFER_HEADING_HIERARCHY`), with font-size inference switched off -- measured on the
same law it buckets headings by typography rather than structure. The level rides along on each
block for diagnostics but deliberately does not drive the heading hierarchy in `@qhse/knowledge`.

Conversions are serialized by `DOCLING_MAX_CONCURRENT_CONVERSIONS` (default 1). Docling's
converter carries model state that is not safe to drive from several threads at once, and
FastAPI's threadpool will happily do so.

`text_extraction` records what actually happened. `extractionMethod` on the revision holds the
provider the extractor reports -- `docling`, `docling+full_page_ocr`, `pdftotext`, or
`pdftotext+ocr` -- rather than always claiming Docling, and the stage's `qualityScore` grades the
outcome: 0.9 clean, 0.7/0.6/0.5 for a fair or poor converter confidence, a partial conversion or
a flat-text fallback, and 0.3 for a text layer that never decoded. Anything below 0.9 also emits
an `extraction_degraded` log line carrying the measurements. To find revisions worth
re-extracting, query `document_processing_jobs` for `job_type = 'text_extraction'` with a
`quality_score` below 0.9.

Model weights are baked into the extractor image. The production compose file mounts
`docling-cache` over the HuggingFace cache directory: Docker seeds a _newly created_ named volume
from the image, but an existing one is left alone, so remove that volume when deploying an image
whose model set changed. Otherwise the container downloads at startup instead -- the service now
converts a small PDF before reporting ready, so that cost lands on the health check rather than
on the first real document.

## Chunking

Chunks are budgeted in tokens, not characters, because the corpus is bilingual. Measured against
`cl100k_base` -- the encoder the `text-embedding-3` models use -- French runs about 4.1 characters
to a token and Arabic about 1.44. The previous budget counted characters and divided by four,
which is accurate for French and under-reports Arabic by a factor of nearly three: the same
6,000-character chunk is roughly 1,450 tokens of French but 4,150 of Arabic. Nothing overflowed
the model's 8,191-token limit, but an Arabic chunk packed close to three times as much of its
provision into one 768-dimension vector, and Arabic retrieval was correspondingly coarser.

`estimateTokens` splits a string's characters between the two rates in proportion to its letters,
which holds to within 3% on French, on Arabic and on text that mixes them, and errs high. The
metadata prefix is charged against the same budget, because it is embedded along with the
content. Splits land on paragraph and then sentence boundaries; chunks do not overlap, since a
chunk is the retrieval index and a hit pulls up its whole provision downstream, so a chunk only
has to be findable rather than complete.

`chunkingVersion` is `normative-v3`. Chunk boundaries and token counts both changed, so a
revision chunked under `normative-v2` is not comparable and has to be reprocessed -- reindexing
alone re-embeds the old boundaries.

## Structure quality

Upload processing uses LLM source-range selection, followed by deterministic validation. Every
extracted block belongs to exactly one stored provision, in order. The worker copies the source
text itself, rejects unknown identifiers, and stores the parent heading hierarchy in sections.
Metadata suggestions retain source excerpts; a reviewer accepts or rejects them before publication.
Taxonomy classification uses the document's meaning rather than keyword matches.

A missing API key, denied AI/external-processing rights, invalid source ranges, or oversized input
fails the stage visibly. Correct the source and reprocess it. Reindexing alone does not change
article boundaries. Existing published sources continue to work without reprocessing, but receive
new metadata and structure only after explicit reprocessing and review.

The captured deterministic segmenter fixtures in `evals/document-extraction` remain useful for the
legacy parser; new LLM ingestion regression tests live in the worker's `law-*.spec.ts` files.

## LLM settings

Every value below — the API key, each model, the service tier, the token ceilings, the run budget,
the per-token rates, and the retrieval switch — resolves in three layers: the `llm_settings` row
the administration workspace writes, then the environment variable, then a built-in default. An
unset column falls through, so a deployment that never opens the tab behaves exactly as it did
when these were environment-only.

Writes need the `super_admin` or `platform_admin` role. The API key is encrypted with AES-256-GCM
under a key derived from `BETTER_AUTH_SECRET` and is never read back — the tab shows a masked
preview. Rotating `BETTER_AUTH_SECRET` therefore orphans a stored key: the services fall back to
`OPENAI_API_KEY` and an administrator has to re-enter it.

Each service polls the row every 30 seconds, so a saved change reaches the workers within a
minute rather than on the next deploy. "Reset everything to the environment" deletes the row.

## Accuracy-first regulatory analysis

The worker first asks the configured regulatory model to understand the complete project profile
without seeing the platform catalog. A single bounded web-enabled call verifies current references
and titles against preferably official Moroccan and ISO sources, then proposes potentially
applicable laws. Queries use generic sector, activity and risk terms and exclude organization
names, contacts, identifiers and confidential values. Each proposed text becomes one law-level
candidate; the worker does not query the document catalog or expand a stored law into its articles
or clauses. There is no embedding-profile prerequisite, corpus retrieval, query expansion, excerpt
triage, or provision cutoff in this path.

Discovery calls use a 4,000-token output ceiling and the existing model-call ledger (with no
provision attached). The result does not depend on corpus contents. A proposed URL is retained only
when the search tool cited it. Failed discovery fails visibly rather than producing an apparently
complete empty assessment. New laws enter human review before publication.

Stored normative documents retain the complete official text and provision structure for source
traceability and later exact-text obligation extraction. They are not searched to determine which
laws apply to a project.

Publishing an approved baseline automatically queues a second, separate conformity pass. That pass
compares each newly assessable requirement with the baseline's immutable project-profile snapshot and
the evidence already linked to the evaluation. It stores an AI recommendation separately from the
human-approved result. Recommendations below 70% confidence are conservatively normalized to
`NON_CONFORMING`, and the missing information is listed explicitly. Responsible, resource, start-date,
and due-date suggestions are discarded unless confidence is at least 80% and the exact value appears in
the supplied project context. The pass writes its assessment into the evaluation’s own result and
creates the proposed corrective action directly, so the register is filled in rather than annotated;
unsupported planning fields remain empty and a proposed responsible is stored as a free-text name until
someone assigns a real member. A reviewer reads the register and changes whatever they disagree with —
`evaluatedAt` stays null until they do, which is what separates an AI-filled result from a confirmed one
in the counters and the export. Use **Relancer l’évaluation IA** to retry pending or failed
recommendations without overwriting evaluations a reviewer has already confirmed.

The conformity pass never aborts on a single bad requirement: a failure marks that one evaluation
`FAILED` with its error message and the pass continues. Failed evaluations are skipped by the job’s
own retries, so a deterministically failing requirement cannot starve the rest of the baseline — only
an explicit **Relancer l’évaluation IA** resets them to pending. Five consecutive failures are read as
a provider outage and stop the pass; the remainder is retried by BullMQ and, on the last attempt,
marked `FAILED` rather than left pending forever. A recommendation stuck `PENDING` or `RUNNING` with
no activity for `staleAiEvaluationMs` (10 minutes) is treated as dead: the button re-enables, the
2-second polling stops, and the re-run may reset it.

Every conformity model call is reserved and settled in the `regulatory_model_calls` ledger under
stage `conformity_evaluation`, against the baseline’s analysis run. Spend is capped cumulatively per
baseline by `REGULATORY_EVALUATION_BUDGET_MICRO_USD` (default 10 000 000 µUSD = $10), which covers
re-runs and job retries as well as the initial pass. When the cap is reached the remaining
evaluations are marked `FAILED` with an explicit budget message instead of the job retrying; raise
the variable to re-run a large baseline. Reservations left `RUNNING` by a crashed worker are settled
at their reserved amount after 15 minutes so they stop consuming the cap.

Published baselines are immutable. There is no automatic backfill: an older entry without approved
requirement wording displays **Exigence à régénérer** and cannot be exported. Use **Actualiser
l’analyse** to supersede an unpublished `READY_FOR_REVIEW` or `PARTIAL` run, review the newly drafted
requirements, and publish a successor baseline. Queued, running, and clarification runs cannot be
superseded.

Activating a profile atomically retires the prior profile. Its vectors remain available for
rollback. A revision is returned only when it is published, human-validated, effective for the
requested date, visible, in the Morocco/global ISO scope, fully indexed under the active profile,
and permitted by every required rights flag.

## Diagnosing "L'analyse n'a pas abouti" in la veille réglementaire

### Following a running analysis

The customer page polls every two seconds. Law discovery advances from 10–45%, followed by
law-candidate persistence and finalization. During the discovery call, the model-call ledger and
worker heartbeat confirm that the request is alive. A restart repeats the idempotent law discovery.

Follow the structured worker log locally:

```bash
docker compose logs -f worker | rg 'regulatory_(analysis|retrieval|model|finalization)'
```

Useful events are `regulatory_retrieval_started`, `regulatory_retrieval_finished`,
`regulatory_model_call_started`, the 30-second `regulatory_model_call_heartbeat`, and
`regulatory_model_call_finished`. Records contain run/job IDs, attempt, duration, token usage, and
safe error details. They deliberately never contain profile prompts or source text.

If the percentage is unchanged and there is no heartbeat, first confirm the infrastructure and
worker are running:

```bash
docker compose ps postgres redis worker
docker compose logs --tail=100 worker
docker compose exec -T worker wget -q -O - http://127.0.0.1:4002/health/live
docker compose exec -T worker wget -q -O - http://127.0.0.1:4002/health/ready
```

When applications run on the host with `pnpm dev`, use that terminal's `qhse-worker` JSON output
instead. For centralized logs and traces, start the local stack with `pnpm obs:up`; production must
send worker OTLP logs and traces to its managed collector.

The regulatory analysis runs against the **ACTIVE** profile only. Every reason it can be
unavailable is reported by a single endpoint:

```bash
curl -s --cookie "$ADMIN_COOKIE" https://<admin-api>/v1/documents/embedding-profiles | jq
```

`reason` is `null` when search is healthy; otherwise it is the same code the worker writes to
`RegulatoryAnalysisRun.errorCode`, and the customer UI renders its French translation:

| `reason`                          | Meaning                                                                  | Fix                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NORMATIVE_RAG_DISABLED`          | Retrieval is off for the **worker**.                                     | Turn it on in Settings → LLM, or export `NORMATIVE_RAG_ENABLED=true` into the worker container; `compose.production.yaml` defaults it to `false`. |
| `OPENAI_KEY_MISSING`              | No API key resolves, from the settings row or `OPENAI_API_KEY`.          | Save one in Settings → LLM, or set the variable and restart the worker.                                                                           |
| `EMBEDDING_PROFILE_MISSING`       | The corpus was never indexed.                                            | Run rollout steps 6–7.                                                                                                                            |
| `EMBEDDING_PROFILE_BUILDING`      | Indexing is under way.                                                   | Wait for the BullMQ jobs; check `missingChunks` per profile.                                                                                      |
| `EMBEDDING_PROFILE_NOT_ACTIVATED` | A profile is READY but step 7 was skipped.                               | `POST /v1/documents/embedding-profiles/{profileId}/activate`.                                                                                     |
| `EMBEDDING_PROFILE_STALE`         | Content was published after the active profile was built.                | Reindex the new revisions, then activate the refreshed profile.                                                                                   |
| `REGULATORY_MODEL_UNAVAILABLE`    | The configured accuracy model failed or was rejected (not a rate limit). | Verify model access and both regulatory model variables; restart the worker.                                                                      |
| `REGULATORY_MODEL_RATE_LIMITED`   | An OpenAI TPM rate limit persisted past all 3 retries.                   | Transient — retrying from the veille page works as-is. If it recurs, see the TPM note above (raise the account limit or lower concurrency).       |
| `REGULATORY_WORKER_UNAVAILABLE`   | No BullMQ regulatory worker is registered.                               | Check worker readiness/logs and its Redis connection before retrying.                                                                             |
| `REGULATORY_BUDGET_LIMIT`         | The run stopped before exceeding its configured budget.                  | Review completed candidates, then start a new run or explicitly revise the budget.                                                                |

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

## Permanently removing a document

`DELETE /v1/documents/{documentId}` soft-deletes a dependency-free draft and keeps the audit
trail. To take a document out entirely — revisions, files and stored objects, provisions, chunks,
embeddings, processing and review history, relationships, activity, and any regulatory register
entry citing its provisions — use the purge, exposed in the admin UI as **Delete permanently** on
the document detail page:

```bash
curl -X DELETE --cookie "$ADMIN_COOKIE" https://<admin-api>/v1/documents/<id>/purge | jq  # dry run
curl -X DELETE --cookie "$ADMIN_COOKIE" "https://<admin-api>/v1/documents/<id>/purge?confirm=true"
```

Without `confirm=true` it only reports what it would destroy; `confirm` is matched against the
exact string `true`. It requires the `delete` permission (`super_admin` or `platform_admin`).

**This is available in every environment, including production, and cannot be undone.** It deletes
the audit trail along with the document, so the only record of a purge is the warning line the
admin API logs with the actor, the caller IP and the full impact — export those logs if you need a
durable trail. Read the dry-run impact before confirming: `regulatoryRegisterEntries`,
`regulatoryCandidates`, and `regulatoryModelCalls` are customer analysis rows in live projects,
and they are destroyed too, because they hold RESTRICT references to the provisions being removed.
Prefer `POST /v1/documents/{id}/archive` whenever the goal is to retire a document rather than
erase it.

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

The requirement-drafting evaluation also uses synthetic French and Arabic articles only; licensed
ISO text stays outside Git:

```bash
pnpm exec dotenv -e .env -- env OPENAI_LIVE_TESTS=true pnpm --filter @qhse/integration-tests exec vitest run regulatory-watch-openai.live.integration.test.ts
```

Release acceptance requires 100% exact source citations/support excerpts, zero raw-chunk leakage,
zero non-normative golden rows, and at least 95% provision-level precision and recall on the curated
internal regulatory evaluation dataset.
