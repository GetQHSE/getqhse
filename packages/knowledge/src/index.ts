import { createHash } from "node:crypto";

export type NormativeLanguage = "fr" | "ar";
export type ProvisionType =
  "clause" | "article" | "definition" | "annex" | "table" | "note" | "section";

export type ExtractedPage = {
  pageNumber: number;
  text: string;
};

/** One labeled layout item from the extractor, in reading order. */
export type ExtractedBlock = {
  blockType: string;
  text: string;
  pageNumber: number;
};

export type NormativeProvision = {
  type: ProvisionType;
  sourceIdentifier: string | null;
  title: string | null;
  headingPath: string[];
  language: NormativeLanguage;
  content: string;
  contentHash: string;
  pageStart: number;
  pageEnd: number;
  orderIndex: number;
};

export type NormativeChunk = {
  provisionOrderIndex: number;
  chunkIndex: number;
  content: string;
  searchText: string;
  embeddingText: string;
  contentHash: string;
  tokenCount: number;
  language: NormativeLanguage;
  headingPath: string[];
  pageStart: number;
  pageEnd: number;
};

export type RevisionRights = {
  storage: boolean;
  extraction: boolean;
  embedding: boolean;
  aiProcessing: boolean;
  externalProviderProcessing: boolean;
  excerptDisplay: boolean;
};

export type RightsOperation =
  "store" | "extract" | "embed" | "ai-process" | "external-process" | "display-excerpt";

const operationRight: Record<RightsOperation, keyof RevisionRights> = {
  store: "storage",
  extract: "extraction",
  embed: "embedding",
  "ai-process": "aiProcessing",
  "external-process": "externalProviderProcessing",
  "display-excerpt": "excerptDisplay",
};

export class RightsDeniedError extends Error {
  constructor(readonly operation: RightsOperation) {
    super(`Revision rights do not permit ${operation}`);
    this.name = "RightsDeniedError";
  }
}

export function assertRevisionRight(rights: RevisionRights, operation: RightsOperation): void {
  if (!rights[operationRight[operation]]) throw new RightsDeniedError(operation);
}

export function hasSearchRights(rights: RevisionRights): boolean {
  return (
    rights.storage &&
    rights.extraction &&
    rights.embedding &&
    rights.aiProcessing &&
    rights.externalProviderProcessing &&
    rights.excerptDisplay
  );
}

export type NormativeSearchEligibility = {
  revisionStatus: string;
  humanValidated: boolean;
  documentStatus: string;
  visibility: string;
  documentFamily: "standard" | "regulation";
  countryCode: string | null;
  jurisdiction: string | null;
  language: NormativeLanguage;
  requestedLanguages: readonly NormativeLanguage[];
  asOf: string;
  effectiveDate: string;
  expirationDate: string | null;
  rights: RevisionRights;
  allChunksEmbedded: boolean;
};

export function isNormativeSearchEligible(input: NormativeSearchEligibility): boolean {
  const scopeAllowed =
    input.countryCode === "MA" ||
    (input.documentFamily === "standard" &&
      (input.countryCode === null ||
        ["global", "international", "iso"].includes(input.jurisdiction?.toLowerCase() ?? "")));
  return (
    input.revisionStatus === "PUBLISHED" &&
    input.humanValidated &&
    input.documentStatus !== "ARCHIVED" &&
    ["ORGANIZATION_AVAILABLE", "PUBLIC_REFERENCE"].includes(input.visibility) &&
    input.requestedLanguages.includes(input.language) &&
    scopeAllowed &&
    input.effectiveDate <= input.asOf &&
    (input.expirationDate === null || input.expirationDate > input.asOf) &&
    hasSearchRights(input.rights) &&
    input.allChunksEmbedded
  );
}

export function normalizeExtractedText(value: string): string {
  return value
    .normalize("NFC")
    .replaceAll("\u00a0", " ")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const frenchArticle =
  /^\s*(article)\s+((?:premier|unique)|\d+(?:[-–]\d+)?(?:\s*(?:bis|ter|quater))?)\s*[:.\-–]?\s*(.*)$/iu;
const arabicArticle = /^\s*(المادة)\s+([\d٠-٩]+(?:\s*(?:مكرر|المكررة))?)\s*[:.\-–]?\s*(.*)$/u;
const isoClause = /^\s*(\d+(?:\.\d+)+)\s+(.+)$/u;
const annex = /^\s*(?:annexe|annex|الملحق)\s*([\p{L}\d-]+)?\s*[:.\-–]?\s*(.*)$/iu;
const definition = /^\s*(?:définition|definition|تعريف)\s*[:.\-–]?\s*(.*)$/iu;
const note = /^\s*(?:note|ملاحظة)\s*[:.\-–]?\s*(.*)$/iu;

type HeadingMatch = { type: ProvisionType; identifier: string | null; title: string | null };

function matchHeading(line: string): HeadingMatch | null {
  const fr = frenchArticle.exec(line);
  if (fr)
    return {
      type: "article",
      identifier: `Article ${fr[2] ?? ""}`.trim(),
      title: fr[3]?.trim() || null,
    };
  const ar = arabicArticle.exec(line);
  if (ar)
    return {
      type: "article",
      identifier: `المادة ${ar[2] ?? ""}`.trim(),
      title: ar[3]?.trim() || null,
    };
  const clause = isoClause.exec(line);
  if (clause)
    return { type: "clause", identifier: clause[1] ?? null, title: clause[2]?.trim() || null };
  const annexMatch = annex.exec(line);
  if (annexMatch)
    return {
      type: "annex",
      identifier: annexMatch[1] ? `Annexe ${annexMatch[1]}` : "Annexe",
      title: annexMatch[2]?.trim() || null,
    };
  const definitionMatch = definition.exec(line);
  if (definitionMatch)
    return { type: "definition", identifier: null, title: definitionMatch[1]?.trim() || null };
  const noteMatch = note.exec(line);
  if (noteMatch) return { type: "note", identifier: null, title: noteMatch[1]?.trim() || null };
  return null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function detectNormativeProvisions(
  pages: readonly ExtractedPage[],
  language: NormativeLanguage,
): NormativeProvision[] {
  const provisions: NormativeProvision[] = [];
  let current:
    | (Omit<NormativeProvision, "content" | "contentHash" | "pageEnd" | "orderIndex"> & {
        lines: string[];
        pageEnd: number;
      })
    | null = null;

  const flush = () => {
    if (!current) return;
    const content = normalizeExtractedText(current.lines.join("\n"));
    if (content) {
      provisions.push({
        type: current.type,
        sourceIdentifier: current.sourceIdentifier,
        title: current.title,
        headingPath: current.headingPath,
        language: current.language,
        content,
        contentHash: sha256(content),
        pageStart: current.pageStart,
        pageEnd: current.pageEnd,
        orderIndex: provisions.length,
      });
    }
    current = null;
  };

  for (const page of [...pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    const lines = normalizeExtractedText(page.text).split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (current?.lines.at(-1) !== "") current?.lines.push("");
        continue;
      }
      const heading = matchHeading(line);
      if (heading) {
        flush();
        const label = [heading.identifier, heading.title].filter(Boolean).join(" — ");
        current = {
          type: heading.type,
          sourceIdentifier: heading.identifier,
          title: heading.title,
          headingPath: label ? [label] : [],
          language,
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber,
          lines: [line],
        };
      } else if (current) {
        current.lines.push(line);
        current.pageEnd = page.pageNumber;
      } else {
        current = {
          type: "section",
          sourceIdentifier: null,
          title: null,
          headingPath: [],
          language,
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber,
          lines: [line],
        };
      }
    }
  }
  flush();
  return provisions;
}

// Extractor labels for material that repeats on, or interrupts, every page. Inlining it into
// page text is what interleaved running titles and page numbers into whichever provision
// happened to span that spot.
const noiseBlockTypes = new Set(["page_header", "page_footer", "footnote"]);
const headingBlockTypes = new Set(["section_header", "title", "subtitle", "chapter", "heading"]);

// Container headings group provisions without being one themselves. Keeping them as
// headingPath ancestors is what lets a provision that refers to its surroundings ("est puni
// quiconque contrevient au présent chapitre") stay interpretable once retrieved on its own.
const containerHeadings: Array<{ pattern: RegExp; rank: number }> = [
  { pattern: /^\s*(?:titre|partie|livre|الباب)\b/iu, rank: 1 },
  { pattern: /^\s*(?:chapitre|chapter|القسم)\b/iu, rank: 2 },
  { pattern: /^\s*(?:sous-section|section|الفرع)\b/iu, rank: 3 },
];
// A labeled heading naming no article or clause ("Des infractions et des sanctions") is a
// container too, but its depth is unknown, so it nests below every named container.
const unnamedContainerRank = 4;

function containerRank(line: string): number | null {
  return containerHeadings.find(({ pattern }) => pattern.test(line))?.rank ?? null;
}

type OpenProvision = Omit<
  NormativeProvision,
  "content" | "contentHash" | "pageEnd" | "orderIndex"
> & { lines: string[]; pageEnd: number };

function closeProvision(open: OpenProvision, orderIndex: number): NormativeProvision | null {
  const content = normalizeExtractedText(open.lines.join("\n"));
  if (!content) return null;
  return {
    type: open.type,
    sourceIdentifier: open.sourceIdentifier,
    title: open.title,
    headingPath: open.headingPath,
    language: open.language,
    content,
    contentHash: sha256(content),
    pageStart: open.pageStart,
    pageEnd: open.pageEnd,
    orderIndex,
  };
}

/**
 * Segments provisions from labeled layout blocks rather than from flattened page text.
 *
 * The labels carry three things a line-by-line regex scan over flattened text cannot recover:
 * which items are page furniture, which heading opens a provision versus merely groups them,
 * and where a table's boundaries are. Blocks whose label says nothing useful still fall back
 * to line scanning, so an extractor that only produces paragraphs keeps working.
 */
export function detectNormativeProvisionsFromBlocks(
  blocks: readonly ExtractedBlock[],
  language: NormativeLanguage,
): NormativeProvision[] {
  const provisions: NormativeProvision[] = [];
  const context: Array<{ rank: number; label: string }> = [];
  let current: OpenProvision | null = null;

  const flush = () => {
    if (!current) return;
    const provision = closeProvision(current, provisions.length);
    if (provision) provisions.push(provision);
    current = null;
  };

  const openProvision = (heading: HeadingMatch, line: string, pageNumber: number) => {
    flush();
    const label = [heading.identifier, heading.title].filter(Boolean).join(" — ");
    current = {
      type: heading.type,
      sourceIdentifier: heading.identifier,
      title: heading.title,
      headingPath: [...context.map((entry) => entry.label), ...(label ? [label] : [])],
      language,
      pageStart: pageNumber,
      pageEnd: pageNumber,
      lines: [line],
    };
  };

  const openContainer = (label: string, rank: number) => {
    flush();
    while (context.length && (context.at(-1)?.rank ?? 0) >= rank) context.pop();
    context.push({ rank, label });
  };

  const append = (line: string, pageNumber: number) => {
    const open = current;
    if (open) {
      open.lines.push(line);
      open.pageEnd = pageNumber;
      return;
    }
    // Material ahead of the first recognizable heading is still normative content.
    current = {
      type: "section",
      sourceIdentifier: null,
      title: null,
      headingPath: context.map((entry) => entry.label),
      language,
      pageStart: pageNumber,
      pageEnd: pageNumber,
      lines: [line],
    };
  };

  const separate = () => {
    const open = current;
    if (open && open.lines.at(-1) !== "") open.lines.push("");
  };

  for (const block of blocks) {
    if (noiseBlockTypes.has(block.blockType)) continue;
    const blockText = normalizeExtractedText(block.text);
    if (!blockText) continue;

    // A table is one indivisible unit. Scanning its rows line by line is what tore
    // "infraction | amende" pairs apart and left sanctions without the offence they punish.
    if (block.blockType === "table") {
      append(blockText, block.pageNumber);
      separate();
      continue;
    }

    const declaredHeading = headingBlockTypes.has(block.blockType);
    let openedHere = false;
    for (const rawLine of blockText.split("\n")) {
      const line = rawLine.trim();
      if (!line) {
        separate();
        continue;
      }
      const rank = containerRank(line);
      if (rank !== null) {
        openContainer(line, rank);
        continue;
      }
      const heading = matchHeading(line);
      if (heading) {
        openProvision(heading, line, block.pageNumber);
        openedHere = true;
        continue;
      }
      if (declaredHeading && !openedHere) {
        openContainer(line, unnamedContainerRank);
        continue;
      }
      append(line, block.pageNumber);
    }
    // Two blocks are two layout items: keeping them in separate paragraphs stops a table row
    // and the next heading from reading as one run-on sentence.
    separate();
  }

  flush();
  return provisions;
}

function splitLongContent(content: string, maxCharacters: number): string[] {
  if (content.length <= maxCharacters) return [content];
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const parts =
      paragraph.length <= maxCharacters
        ? [paragraph]
        : (paragraph
            .match(new RegExp(`[\\s\\S]{1,${maxCharacters}}(?:\\s|$)`, "g"))
            ?.map((part) => part.trim())
            .filter(Boolean) ?? [paragraph]);
    for (const part of parts) {
      if (current && current.length + part.length + 2 > maxCharacters) {
        chunks.push(current);
        current = "";
      }
      current = current ? `${current}\n\n${part}` : part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export type ChunkContext = {
  documentTitle: string;
  referenceNumber?: string | null;
  sourceEdition?: string | null;
};

export function chunkNormativeProvisions(
  provisions: readonly NormativeProvision[],
  context: ChunkContext,
  maxCharacters = 6_000,
): NormativeChunk[] {
  let chunkIndex = 0;
  return provisions.flatMap((provision) =>
    splitLongContent(provision.content, maxCharacters).map((content) => {
      // The same label routinely arrives from several sides — a document titled after its
      // own reference number, an identifier that already ends the heading path. Repeating it
      // dilutes the embedding, so each distinct label is kept once, in reading order.
      const metadata = [
        ...new Set(
          [
            context.documentTitle,
            context.referenceNumber,
            context.sourceEdition,
            ...provision.headingPath,
            provision.sourceIdentifier,
          ].filter((value): value is string => Boolean(value)),
        ),
      ];
      const searchText = [...metadata, content].join("\n");
      return {
        provisionOrderIndex: provision.orderIndex,
        chunkIndex: chunkIndex++,
        content,
        searchText,
        embeddingText: searchText,
        contentHash: sha256(content),
        tokenCount: Math.ceil(searchText.length / 4),
        language: provision.language,
        headingPath: provision.headingPath,
        pageStart: provision.pageStart,
        pageEnd: provision.pageEnd,
      };
    }),
  );
}

export function embeddingInputHash(profileKey: string, input: string): string {
  return sha256(`${profileKey}\u0000${input}`);
}

export type RankedCandidate = { id: string; rank: number; score?: number };
export type FusedCandidate = {
  id: string;
  rrfScore: number;
  keywordRank: number | null;
  semanticRank: number | null;
  keywordScore: number | null;
  semanticScore: number | null;
};

export function reciprocalRankFusion(
  keyword: readonly RankedCandidate[],
  semantic: readonly RankedCandidate[],
  limit = 10,
  rankConstant = 60,
): FusedCandidate[] {
  const merged = new Map<string, FusedCandidate>();
  const add = (candidate: RankedCandidate, kind: "keyword" | "semantic") => {
    const existing = merged.get(candidate.id) ?? {
      id: candidate.id,
      rrfScore: 0,
      keywordRank: null,
      semanticRank: null,
      keywordScore: null,
      semanticScore: null,
    };
    existing.rrfScore += 1 / (rankConstant + candidate.rank);
    if (kind === "keyword") {
      existing.keywordRank = candidate.rank;
      existing.keywordScore = candidate.score ?? null;
    } else {
      existing.semanticRank = candidate.rank;
      existing.semanticScore = candidate.score ?? null;
    }
    merged.set(candidate.id, existing);
  };
  keyword.forEach((candidate) => add(candidate, "keyword"));
  semantic.forEach((candidate) => add(candidate, "semantic"));
  return [...merged.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function extractExactReference(query: string): string | null {
  const match = query.match(
    /\b(?:article\s+)?\d+(?:\.\d+)+(?:\b|$)|\barticle\s+(?:premier|unique|\d+(?:[-–]\d+)?)\b|المادة\s+[\d٠-٩]+/iu,
  );
  return match?.[0]?.trim() ?? null;
}

export function stableCitationLabel(input: {
  referenceNumber?: string | null;
  documentTitle: string;
  revisionLabel: string;
  provisionIdentifier?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
}): string {
  const document = input.referenceNumber || input.documentTitle;
  const provision = input.provisionIdentifier ? `, ${input.provisionIdentifier}` : "";
  const pages = input.pageStart
    ? `, p. ${input.pageStart}${input.pageEnd && input.pageEnd !== input.pageStart ? `–${input.pageEnd}` : ""}`
    : "";
  return `${document} (${input.revisionLabel})${provision}${pages}`;
}

export function boundedExcerpt(content: string, maxCharacters = 1_200): string {
  if (content.length <= maxCharacters) return content;
  const boundary = content.lastIndexOf(" ", maxCharacters - 1);
  return `${content.slice(0, boundary > maxCharacters * 0.7 ? boundary : maxCharacters).trimEnd()}…`;
}
