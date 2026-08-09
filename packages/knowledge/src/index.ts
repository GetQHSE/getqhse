import { createHash } from "node:crypto";

export type NormativeLanguage = "fr" | "ar";
export type ProvisionType =
  "clause" | "article" | "definition" | "annex" | "table" | "note" | "section";

export type ExtractedPage = {
  pageNumber: number;
  text: string;
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
      const metadata = [
        context.documentTitle,
        context.referenceNumber,
        context.sourceEdition,
        ...provision.headingPath,
        provision.sourceIdentifier,
      ].filter((value): value is string => Boolean(value));
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
