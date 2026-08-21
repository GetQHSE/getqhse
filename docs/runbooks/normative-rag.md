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

## Accuracy-first regulatory analysis

The regulatory worker uses `OPENAI_REGULATORY_MODEL=gpt-5-mini` and
`OPENAI_REGULATORY_REASONING_EFFORT=low` by default. Keep both values explicit in production. A
configured model failure stops the run with `REGULATORY_MODEL_UNAVAILABLE`; the worker never falls
back silently to another model. Requests use `store=false`, a 180-second timeout, zero SDK retries,
and output ceilings of 12,000 tokens for drafting and 6,000 tokens for verification. The only retry
is one explicit corrected draft after verifier feedback.

Every generation call has a durable ledger row containing its candidate, stage, attempt, status,
duration, token and reasoning-token usage, reserved cost, and reconciled cost. Before a call, the
worker reserves a conservative worst-case amount against the run's `$1` default budget. A timed-out
call with unknown usage consumes its full reservation. When another call would exceed the budget,
the run becomes `PARTIAL` with stop reason `REGULATORY_BUDGET_LIMIT`; completed candidates remain
reviewable, publication stays disabled, and a new analysis may supersede the partial run.

Each run expands queries from the validated project profile, fuses keyword and vector ranks,
expands the best 20 documents, deduplicates logical provisions, and analyzes at most 100 provisions.
Cover pages, tables of contents, notes, definitions, tables, introductory `0.x` clauses, heading-only
clauses, and informative annexes are removed before model review. Regulations require an identified
article; standards require an identified clause or an explicitly normative annex.

Every provision is drafted alone from its complete source text. The worker validates exact supporting
excerpts, rejects copied passages and corrupted/truncated input, then runs an independent verification.
It retries drafting once with verifier feedback. A remaining failure becomes
`SOURCE_REVIEW_REQUIRED` and blocks both reviewer approval and baseline publication until the source
document is corrected, reprocessed, reindexed, and the analysis is rerun.

Publishing an approved baseline automatically queues a second, separate conformity pass. That pass
compares each newly assessable requirement with the baseline's immutable project-profile snapshot and
the evidence already linked to the evaluation. It stores an AI recommendation separately from the
human-approved result. Recommendations below 70% confidence are conservatively normalized to
`NON_CONFORMING`, and the missing information is listed explicitly. Responsible, resource, start-date,
and due-date suggestions are discarded unless confidence is at least 80% and the exact value appears in
the supplied project context. A reviewer must still validate or override the recommendation. Validating
a partial or non-conforming recommendation creates the proposed corrective action; unsupported planning
fields remain empty. Use **Relancer l’évaluation IA** to retry pending or failed recommendations without
overwriting human-approved evaluations.

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

The customer page polls every two seconds. Retrieval advances from 10–45%, provision-by-provision
classification advances from 50–92%, and finalization is reported at 95%. Exactly 50% means retrieval
finished and the worker is at the first classification candidate; it is not itself evidence of a
deadlock. During a model
call the phase identifies whether the worker is drafting, independently verifying, or retrying an
exigence. A percentage that changes confirms completed work; the worker log heartbeat confirms a
long-running model request is still alive. Each completed candidate is persisted immediately, so a
worker restart resumes from its checkpoints instead of repeating completed OpenAI calls.

Follow the structured worker log locally:

```bash
docker compose logs -f worker | rg 'regulatory_(analysis|retrieval|provision|model|finalization)'
```

Useful events are `regulatory_provision_started`, `regulatory_model_call_started`, the 30-second
`regulatory_model_call_heartbeat`, `regulatory_model_call_finished`, and
`regulatory_provision_finished`. Records contain run/job IDs, provision identifiers, candidate
position and total, attempt, duration, token usage, and error details. They deliberately never
contain profile prompts, source provisions, excerpts, or drafted requirements.

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

| `reason`                          | Meaning                                                   | Fix                                                                                    |
| --------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `NORMATIVE_RAG_DISABLED`          | The **worker** does not see `NORMATIVE_RAG_ENABLED=true`. | Export it into the worker container; `compose.production.yaml` defaults it to `false`. |
| `OPENAI_KEY_MISSING`              | `OPENAI_API_KEY` is unset.                                | Set it, restart the worker.                                                            |
| `EMBEDDING_PROFILE_MISSING`       | The corpus was never indexed.                             | Run rollout steps 6–7.                                                                 |
| `EMBEDDING_PROFILE_BUILDING`      | Indexing is under way.                                    | Wait for the BullMQ jobs; check `missingChunks` per profile.                           |
| `EMBEDDING_PROFILE_NOT_ACTIVATED` | A profile is READY but step 7 was skipped.                | `POST /v1/documents/embedding-profiles/{profileId}/activate`.                          |
| `EMBEDDING_PROFILE_STALE`         | Content was published after the active profile was built. | Reindex the new revisions, then activate the refreshed profile.                        |
| `REGULATORY_MODEL_UNAVAILABLE`    | The configured accuracy model failed or was rejected.     | Verify model access and both regulatory model variables; restart the worker.           |
| `REGULATORY_WORKER_UNAVAILABLE`   | No BullMQ regulatory worker is registered.                | Check worker readiness/logs and its Redis connection before retrying.                  |
| `REGULATORY_BUDGET_LIMIT`         | The run stopped before exceeding its configured budget.   | Review completed candidates, then start a new run or explicitly revise the budget.     |

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
durable trail. Read the dry-run impact before confirming: `regulatoryRegisterEntries` and
`regulatoryCandidates` are customer register rows in live projects, and they are destroyed too,
because they hold RESTRICT references to the provisions being removed. Prefer
`POST /v1/documents/{id}/archive` whenever the goal is to retire a document rather than erase it.

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
