# Admin-managed AI prompts

The administration workspace exposes **Settings → AI Prompts**, grouped by product page and
section. The catalog covers the platform's business prompts, including document ingestion and
regulatory article retrieval. Legacy regulatory definitions are explicitly marked. The provider
connection probe remains an engineering diagnostic.

## Editorial workflow

1. Select a bundled default or an existing revision, edit its instructions and explain the change.
2. Save a new draft. Content and its SHA-256 hash are immutable; later edits create another revision.
3. Run model previews with synthetic material. French, English and Arabic are supported. Review the
   output and record a validation note. At least one successful preview is required for validation.
4. A platform administrator publishes the validated revision for all organizations. Re-publishing a
   previous validated revision records a rollback. Restoring the bundled default records a reset.

Support operators can inspect prompts and history. Content managers, platform administrators and
super administrators can draft, preview and validate. Only platform administrators and super
administrators can publish, roll back or reset. These checks are enforced in the API, independently
of the interface.

Publication uses a generation counter to reject an administrator's stale view. Updating the active
revision and appending the publication event happen in one database transaction. Drafts never become
active simply by being saved or validated.

## Preview boundaries

Previews call the feature's configured provider/model, with a bounded input and output size and a
one-minute timeout. They consume tokens. Synthetic input is hashed rather than stored; preview
outputs and the actor are stored against the exact revision.

This is an editorial preview: JSON prompts request valid JSON, while research discovery and profile
conversation prompts request text. Application tools and web search are not executed. A successful
preview does **not** establish compatibility with the production output schema, evidence checks,
scoring rules or domain validation. The reviewer should also exercise the corresponding feature in
a test environment before approving significant behavior changes. Publication requires explicit
human validation, not just a successful model response.

## Runtime behavior and provenance

The **Use database prompts** switch at the top of Settings → AI Prompts controls the source for
all organizations. On (the default) uses published, compatible database revisions and falls back
to code defaults where none exists. Off uses bundled code prompts for every new run. Switching
off preserves all revisions and publication selections; switching on resumes those selections.
Only platform administrators and super administrators can change this setting. Concurrent changes
are rejected using a generation counter, and the last updater is stored. Drafting, previews and
publication remain available in code mode; publishing does not change the global source.

`packages/ai/src/prompt-catalog.ts` is the source of bundled system templates and base versions.
Builders continue assembling project context in code. Templates use allowlisted runtime
placeholders; unknown, malformed or missing placeholders are rejected. Runtime language/source
blocks and engineering-owned platform rules are appended after editorial content. The schema,
tools, scoring code and validated project material remain controlled by their existing features.
Prompt instructions are guidance to a model; deterministic production validators remain necessary.

Client API, admin API and workers load compatible validated overrides on startup and poll every
30 seconds. Publication refreshes the admin API immediately. A polling failure preserves the last
good snapshot. An override with an obsolete base version, an invalid template or a mismatched hash
falls back to the bundled default. Bump the catalog base version when changing a feature's prompt
contract; a saved revision against the previous version cannot then be published.

Before a generation starts, `withPromptRun` persists an immutable snapshot of the available
templates. Every step and retry uses that snapshot, including after a process restart. Workers use
the feature and application run ID (document version ID for ingestion), with queue job ID as a
fallback. Profile turns use their AI invocation ID. Used prompt keys, revision IDs and hashes are
recorded on the run snapshot. Profile messages and invocations additionally store their selected
revision and template hash. Snapshots contain instructions, not project context.

If the snapshot cannot be persisted, the generation does not start. A code upgrade that makes a
pinned template incompatible fails that run instead of silently switching its prompt.

## Deployment

Apply `20261011120000_admin_ai_prompts` and `20261017120000_ai_prompt_source` with the existing migration deployment procedure, generate
the Prisma client and deploy/restart all three backend services plus the admin frontend. The new
tables must exist before starting a backend with this feature. There is no seed step: every prompt
uses its bundled default until an administrator publishes a compatible revision. Existing generated
results are not rewritten.

The additive migration is tested against a temporary PostgreSQL container. Integration coverage
includes concurrent publication, rollback/reset, prompt pinning across publication and restart, and
persisted prompt-use provenance. Unit coverage checks roles, publication conflicts, placeholders,
version/hash compatibility, language rules and database failures. UI coverage checks read-only
support access, saving drafts, blocking unsaved previews and sending the publication generation.

Revision, preview and run-snapshot history is retained; this implementation does not automatically
prune it. Retention should preserve the provenance needed for historical QHSE results.
