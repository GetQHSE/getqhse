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

export const applicableLawDiscoverySchema = z.object({
  laws: z
    .array(
      z.object({
        reference: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(300),
        reason: z.string().trim().min(1).max(600),
      }),
    )
    .max(40),
});

export type LawCatalogEntry = {
  documentId: string;
  title: string;
  referenceNumber: string | null;
  tags: string[];
};

export type ApplicableLawProposal = z.infer<typeof applicableLawDiscoverySchema>["laws"][number];

function normalizedIdentity(value: string | null): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[٠-٩۰-۹]/gu, (digit) => {
      const code = digit.codePointAt(0) ?? 0;
      return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
    })
    .toLowerCase()
    .replace(/\b(?:numero|num|no)\b|n[°º]/gu, " ")
    .replace(/[^a-z0-9\u0600-\u06ff]+/gu, " ")
    .trim();
}

function legalKind(value: string): string {
  return value.match(/\b(?:loi|decret|dahir|arrete|code|iso)\b/u)?.[0] ?? "";
}

function numericIdentity(value: string): string {
  return [...value.matchAll(/\d+/gu)].map(([number]) => String(Number(number))).join("-");
}

function matchScore(proposal: ApplicableLawProposal, entry: LawCatalogEntry): number {
  const proposedReference = normalizedIdentity(proposal.reference);
  const storedReference = normalizedIdentity(entry.referenceNumber);
  const proposedTitle = normalizedIdentity(proposal.title);
  const storedTitle = normalizedIdentity(entry.title);
  if (proposedReference && proposedReference === storedReference) return 100;
  const proposedKind = legalKind(proposedReference);
  const storedKind = legalKind(storedReference);
  const proposedNumber = numericIdentity(proposedReference);
  if (
    proposedKind &&
    proposedKind === storedKind &&
    proposedNumber.length >= 3 &&
    proposedNumber === numericIdentity(storedReference)
  )
    return 90;
  if (proposedTitle && proposedTitle === storedTitle) return 80;
  if (
    proposedTitle.length >= 12 &&
    storedTitle.length >= 12 &&
    (proposedTitle.includes(storedTitle) || storedTitle.includes(proposedTitle))
  )
    return 60;
  return 0;
}

/** Resolve model knowledge against stored sources. Ambiguous and absent matches need a source. */
export function resolveApplicableLaws(
  catalog: LawCatalogEntry[],
  proposals: ApplicableLawProposal[],
): { documentIds: string[]; sourceRequired: ApplicableLawProposal[] } {
  const documentIds = new Set<string>();
  const unresolved = new Set<string>();
  const sourceRequired: ApplicableLawProposal[] = [];
  for (const proposal of proposals) {
    const scored = catalog
      .map((entry) => ({ entry, score: matchScore(proposal, entry) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score);
    const best = scored[0];
    if (!best || (scored[1]?.score ?? 0) === best.score) {
      const key = `${normalizedIdentity(proposal.reference)}:${normalizedIdentity(proposal.title)}`;
      if (!unresolved.has(key)) sourceRequired.push(proposal);
      unresolved.add(key);
      continue;
    }
    documentIds.add(best.entry.documentId);
  }
  return { documentIds: [...documentIds], sourceRequired };
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
