# MVP law catalog

Implementation task: [GetQHSE/getqhse#10](https://github.com/GetQHSE/getqhse/issues/10).

## Storage and upload

Use the existing `documents`, `document_sections` and `document_provisions` tables. No separate
law store or additional version-management workflow is introduced. The original uploaded file
remains the reference for manual review.

1. Extract text and page layout through the existing extractor.
2. Suggest title, reference number and issuing authority from exact source excerpts. Reviewed
   metadata decisions are preserved during reprocessing.
3. Ask the model to organize source blocks into articles and other provisions. The worker copies
   the original text from block ranges and rejects gaps, overlaps, reordered ranges and invented
   identifiers. Parent headings are stored as linked sections.
4. Select existing taxonomy terms semantically. Review these suggestions and publish the source.

AI processing and external-provider permissions are required for these model calls. Embedding
permission is optional in the upload form, and publication does not wait for indexing. The
separate document-search feature can still use embeddings.

The MVP structure request accepts up to 180,000 characters of serialized source blocks and
16,000 output tokens. Larger documents fail visibly and should be uploaded as individual laws
or sections. This is a deliberate bounded first implementation, not silent page truncation.
The model cannot recover unreadable OCR: correct or re-extract that source before approval.

## Analysis

The existing LLM enable switch and API key are still required. An embedding profile is not.

- Ask the configured regulatory model to understand the complete project profile and propose up
  to 40 potentially applicable laws from its own knowledge. The model receives no database catalog
  and produces canonical references, titles and short profile-grounded reasons.
- Read the approved, visible catalog afterward, with allowed source rights and the existing
  jurisdiction, language and effective-date filters. Deterministically resolve model references
  and titles against stored sources; do not let the model choose internal database IDs.
- Load articles directly from PostgreSQL. For short laws, supply all provisions as context.
  For larger laws, use complete nearby/same-section provisions and opening scope, capped at
  24,000 characters. Mark partial context explicitly; unresolved references block extraction.
- Keep exact requirement wording and citations tied to the selected article. Existing drafting,
  verification and human review remain. Unknown material profile facts prompt clarification.
- Save absent or ambiguous matches on the run and display them in a separate “Source requise”
  panel. They never become source provisions or requirements automatically.

The catalog model's choices still need evaluation with real profiles. These regression tests
prove source containment, plumbing and failure behavior, not legal accuracy or completeness.

## Local rollout

Apply the normal database migrations (`pnpm db:deploy`) and rebuild/restart the worker and APIs.
The additive migration stores `missing_laws` on analysis runs and permits discovery ledger rows
without an attached provision. Existing published documents remain available. Reprocess an
existing source only when its metadata or segmentation needs replacing, then review it again.

Checks: worker `law-*.spec.ts`, regulatory requirement-verifier tests, publication tests in the
admin API, and regulatory-watch UI tests. No live model calls are made by those tests.
