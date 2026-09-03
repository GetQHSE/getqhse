/**
 * Captures a document extraction as a replayable eval fixture.
 *
 * The fixture holds the extractor's block sequence, not the PDF: the evaluation replays those
 * blocks through segmentation, so it runs in CI with no Docling container, no model weights and
 * no OCR pass. Re-capture a fixture only when the extractor's own behaviour changes.
 *
 *   DOCLING_URL=http://localhost:8000 pnpm eval:extraction:capture <file.pdf> <name> [--redact]
 *
 * `--redact` is required for any source whose text may not be committed. It keeps the layout --
 * labels, pages, and the headings that segmentation keys on -- and replaces body text with inert
 * filler of the same length. A redacted fixture measures boundary detection only; it cannot
 * catch a body line wrongly read as a heading, because its body lines are no longer language.
 */
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

type Block = {
  block_type: string;
  text: string;
  page_number: number;
  heading_level?: number;
};

const [path, name, ...flags] = process.argv.slice(2);
if (!path || !name) throw new Error("usage: capture-fixture <file.pdf> <name> [--redact]");
const redact = flags.includes("--redact");
const url = process.env["DOCLING_URL"] ?? "http://localhost:8000";
const headingTypes = new Set(["section_header", "title", "subtitle", "chapter", "heading"]);

const form = new FormData();
form.append("file", new Blob([await readFile(path)], { type: "application/pdf" }), basename(path));
const response = await fetch(`${url}/v1/extract`, { method: "POST", body: form });
if (!response.ok) throw new Error(`extractor returned ${response.status}: ${await response.text()}`);
const body = (await response.json()) as { blocks: Block[]; metadata: Record<string, string> };

// Inert filler: no digits, no French or Arabic words, nothing a heading pattern can match, and
// no line that could pass for a container keyword.
const fill = (text: string) =>
  text
    .split("\n")
    .map((line) =>
      line
        .split(/\s+/)
        .map((word) => "x".repeat(Math.max(word.length, 1)))
        .join(" "),
    )
    .join("\n");

const blocks = body.blocks.map((block) => ({
  blockType: block.block_type,
  pageNumber: block.page_number,
  text: redact && !headingTypes.has(block.block_type) ? fill(block.text) : block.text,
  ...(typeof block.heading_level === "number" ? { headingLevel: block.heading_level } : {}),
}));

const target = new URL(`fixtures/${name}.blocks.json`, import.meta.url);
await writeFile(
  target,
  `${JSON.stringify(
    {
      name,
      source: basename(path),
      redacted: redact,
      capturedFrom: {
        provider: body.metadata["provider"],
        conversionStatus: body.metadata["conversion_status"],
        textLayerRepair: body.metadata["text_layer_repair"] ?? "none",
      },
      blocks,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `wrote ${target.pathname} (${blocks.length} blocks, ${redact ? "redacted" : "verbatim"}, provider=${body.metadata["provider"]})`,
);
