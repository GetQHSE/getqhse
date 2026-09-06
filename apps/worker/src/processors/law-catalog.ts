import { createHash } from "node:crypto";

import type { ExtractedBlock, NormativeLanguage, NormativeProvision } from "@qhse/knowledge";
import { z } from "zod";

// The model assigns source ranges; application code copies the text. No generated legal wording.
export const lawStructureSchema = z.object({
  nodes: z
    .array(
      z.object({
        ranges: z
          .array(
            z.object({
              startBlock: z.number().int().nonnegative(),
              endBlock: z.number().int().nonnegative(),
            }),
          )
          .min(1),
        type: z.enum(["clause", "article", "definition", "annex", "table", "note", "section"]),
        identifier: z.string().max(100).nullable(),
        title: z.string().max(300).nullable(),
        headingPath: z.array(z.string().max(300)).max(12),
      }),
    )
    .min(1),
});

export function materializeLawStructure(
  blocks: ExtractedBlock[],
  output: z.infer<typeof lawStructureSchema>,
  language: NormativeLanguage,
): NormativeProvision[] {
  const assigned = new Set<number>();
  const provisions = [...output.nodes]
    .sort((a, b) => a.ranges[0]!.startBlock - b.ranges[0]!.startBlock)
    .map((node, orderIndex) => {
      let previousEnd = -1;
      const source = node.ranges.flatMap((range) => {
        if (
          range.startBlock <= previousEnd ||
          range.endBlock < range.startBlock ||
          range.endBlock >= blocks.length
        )
          throw new Error("Law structure duplicated or reordered source ranges; review extraction");
        for (let index = range.startBlock; index <= range.endBlock; index += 1) {
          if (assigned.has(index)) throw new Error("Law structure duplicated source blocks");
          assigned.add(index);
        }
        previousEnd = range.endBlock;
        return blocks.slice(range.startBlock, range.endBlock + 1);
      });
      const content = source.map((block) => block.text).join("\n\n");
      const normalized = (text: string) =>
        text
          .normalize("NFKC")
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, " ")
          .trim();
      if (
        node.identifier &&
        !` ${normalized(content)} `.includes(` ${normalized(node.identifier)} `)
      )
        throw new Error("Law structure invented an identifier absent from its source range");
      return {
        type: node.type,
        sourceIdentifier: node.identifier,
        title: node.title,
        headingPath: node.headingPath,
        language,
        content,
        contentHash: createHash("sha256").update(content).digest("hex"),
        pageStart: source[0]!.pageNumber,
        pageEnd: source.at(-1)!.pageNumber,
        orderIndex,
      };
    });
  if (assigned.size !== blocks.length)
    throw new Error("Law structure skipped or omitted source blocks");
  return provisions;
}

export const lawCatalogSelectionSchema = z.object({
  selectedDocumentIds: z.array(z.string()).max(40),
  missingLaws: z
    .array(
      z.object({
        reference: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(300),
        reason: z.string().trim().min(1).max(600),
      }),
    )
    .max(10),
});

export type LawCatalogEntry = {
  documentId: string;
  title: string;
  referenceNumber: string | null;
  tags: string[];
};

export function validateCatalogSelection(
  catalog: LawCatalogEntry[],
  result: z.infer<typeof lawCatalogSelectionSchema>,
) {
  const allowed = new Set(catalog.map((law) => law.documentId));
  if (result.selectedDocumentIds.some((id) => !allowed.has(id)))
    throw new Error("The model selected a document outside the supplied law catalog");
  return [...new Set(result.selectedDocumentIds)];
}

export type ContextProvision = {
  id: string;
  sourceIdentifier: string | null;
  headingPath: string[];
  content: string;
};

/** Short laws are complete; long laws retain complete nearby provisions, never sliced text. */
export function lawContext(
  provisions: ContextProvision[],
  candidateId: string,
  maxChars = 24_000,
): { text: string; complete: boolean } {
  const render = (items: ContextProvision[]) =>
    items
      .map(
        (item) =>
          `[${item.sourceIdentifier ?? item.id}] ${item.headingPath.join(" > ")}\n${item.content}`,
      )
      .join("\n\n");
  if (!provisions.some((item) => item.id === candidateId)) return { text: "", complete: false };
  const full = render(provisions);
  if (full.length <= maxChars) return { text: full, complete: true };
  const index = provisions.findIndex((item) => item.id === candidateId);
  const candidate = provisions[index];
  if (!candidate) return { text: "", complete: false };
  const selected = new Set<string>();
  let size = 0;
  // Scope near the beginning, then same-section provisions and immediate neighbours.
  const relevant = [
    candidate,
    ...provisions.slice(0, 3),
    ...provisions.filter(
      (item) =>
        candidate.headingPath.length > 0 &&
        item.headingPath.join("/") === candidate.headingPath.join("/"),
    ),
    ...provisions.slice(Math.max(0, index - 2), index + 3),
  ];
  for (const item of relevant) {
    if (selected.has(item.id)) continue;
    const length = render([item]).length + 2;
    if (size + length > maxChars) continue;
    selected.add(item.id);
    size += length;
  }
  return { text: render(provisions.filter((item) => selected.has(item.id))), complete: false };
}
