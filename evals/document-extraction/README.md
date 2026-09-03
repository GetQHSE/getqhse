# Document extraction evaluations

Each fixture is a captured extractor output plus the result it is expected to segment into. The
evaluation replays the blocks through `@qhse/knowledge`, so it runs anywhere with no Docling
container, no model weights and no OCR pass -- it grades the segmenter, which is the part that
changes.

```bash
pnpm eval:extraction
```

## Adding a fixture

Start the extractor, capture the document, then write its expectations by hand.

```bash
pnpm infra:up
DOCLING_URL=http://localhost:8000 pnpm eval:extraction:capture path/to/source.pdf <name> [--redact]
```

`<name>.blocks.json` is written for you; author `<name>.expected.json` beside it after reading
what the segmenter actually produced and confirming it against the source document. Never write
the expectations from the current output alone -- that records the bug along with the behaviour.

## Licensed sources

**`--redact` is required for any source whose text may not be committed**, which includes every
licensed ISO or IMANOR standard. It keeps the layout -- labels, pages, and the headings
segmentation keys on -- and replaces body text with inert filler of the same length. A redacted
fixture measures boundary detection only: it cannot catch a body line wrongly read as a heading,
because its body lines are no longer language. Official legislation is committed verbatim.

Do not commit confidential customer documents, or the PDFs of licensed sources.

## What is graded

- **Contiguous numbering.** Articles are consecutive by construction, so a gap is a boundary the
  segmenter failed to find. This is the strongest signal available and no amount of
  plausible-looking output makes up for it.
- **Required identifiers** the source is known to contain.
- **Fragments** -- an identified provision holding less than 120 characters is its own heading
  with the body left somewhere else.
- **Structure score** from `assessStructureQuality`, against a floor recorded per fixture.
- **Spot checks** tied to a named layout: each one records the failure it exists to catch.

A fixture may also be marked `expectDegraded`, in which case it asserts the opposite: the gate
must refuse it. A gate that has never rejected anything is not a gate, so keep at least one.

## Current fixtures

| Fixture                | Source                             | Captured                | Notes                                                                                                                                               |
| ---------------------- | ---------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loi-09-08`            | Bulletin officiel, loi 09-08       | `docling+full_page_ocr` | Fonts carry no ToUnicode CMap, so the text layer is unusable until the forced OCR pass. 67 articles, no gaps.                                       |
| `nm-22-0-010`          | Moroccan standard NM 22.0.010      | `docling`               | Redacted: IMANOR licensed content. Single-level clauses, and a contents page that must not duplicate them.                                          |
| `loi-09-08-unrepaired` | The same law before the OCR repair | `docling`               | Layout perfect, text not language. Must be **refused** by the quality gate; the extractor no longer returns this, which is why the capture is kept. |
