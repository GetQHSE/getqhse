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
  /**
   * Depth of a section header, when the extractor inferred one. Carried through for diagnostics
   * only: it deliberately does not drive the hierarchy below. Measured against a real Bulletin
   * officiel law, the inference buckets headings by typography rather than by structure --
   * "Chapitre premier" and "Article 2" both come back at level 1, while a cover page's larger
   * type outranks the body that follows it. Ranking on that pops a chapter off the stack the
   * moment its first article opens.
   */
  headingLevel?: number;
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

// A heading names a provision; it never carries the provision's whole body. Anything longer
// than this is a line of prose that happens to open with a heading-shaped token, so its
// "title" is dropped even when the identifier before it is genuine.
const MAX_HEADING_LENGTH = 200;

// Arabic-Indic (٠-٩) and extended Arabic-Indic (۰-۹) digits number the same articles as ASCII
// digits do. Identifiers are compared as text -- by `extractExactReference`, by citation
// labels, by anything checking an article sequence for gaps -- so both scripts have to settle
// on one spelling or "المادة ٥" and "المادة 5" become two unrelated articles.
const arabicIndicDigits = /[٠-٩۰-۹]/gu;

function normalizeDigits(value: string): string {
  return value.replace(arabicIndicDigits, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

// Moroccan legislative texts number their opening provision "Article premier" and every one
// after it "Art. 2", "Art. 3" -- the abbreviation is the rule, not the exception. Matching
// only the spelled-out word left a whole law as a single provision running from article 2 to
// the end of the text.
const frenchArticle =
  /^\s*(?:article\s+|art\.\s*|art\s+)((?:premier|unique|1\s*er)|\d+(?:[-–]\d+)?(?:\s*(?:bis|ter|quater|quinquies))?)\s*[:.\-–—]?\s*(.*)$/iu;
// Dahirs and the older Moroccan codes label an article "الفصل"; later laws use "المادة". Both
// open a provision, and which one it is stays in the identifier because it is part of the
// citation.
const arabicArticle =
  /^\s*(المادة|الفصل)\s+([\d٠-٩۰-۹]+(?:\s*(?:مكرر|المكررة))?)\s*[:.\-–—]?\s*(.*)$/u;
const isoClause = /^\s*(\d+(?:\.\d+)*)\s+(\S.*)$/u;
// French writes thousands with a full stop, so "1.200 à 50.000 dirhams" is shaped exactly like
// a clause number. Reading it as one opened a provision on every sanction amount and tore each
// fine away from the offence it punishes.
const thousandsSeparated = /\.\d{3}(?:\D|$)/u;
// A run of dot leaders ending on a page number is a table of contents entry. Its headings
// appear again as real provisions further on, so admitting them duplicates every clause in the
// document -- and gives the duplicate the page number as its title. The trailing number is what
// keeps an article that merely ends on an ellipsis ("on entend par…") out of this.
const tableOfContentsEntry = /[.…]{3,}[.…\s]*\d+\s*$/u;
const annex = /^\s*(?:annexe|annex|الملحق)\s*([\p{L}\d-]+)?\s*[:.\-–—]?\s*(.*)$/iu;
const definition = /^\s*(?:définition|definition|تعريف)\s*[:.\-–—]?\s*(.*)$/iu;
const note = /^\s*(?:note|ملاحظة)\s*[:.\-–—]?\s*(.*)$/iu;

type HeadingMatch = { type: ProvisionType; identifier: string | null; title: string | null };

function headingTitle(value: string | undefined): string | null {
  // "Art. 2. - Les dispositions…" leaves its dash behind once the identifier is taken off,
  // and that dash would then be repeated into every heading path the provision carries.
  const title = value?.replace(/^[:.\-–—\s]+/u, "").trim();
  if (!title || title.length > MAX_HEADING_LENGTH) return null;
  return title;
}

function frenchArticleIdentifier(ordinal: string): string {
  const normalized = ordinal.toLowerCase().replace(/\s+/gu, " ").trim();
  return `Article ${normalized === "1 er" || normalized === "1er" ? "premier" : normalized}`;
}

/**
 * Reads an ISO/NM clause heading, which is a bare number followed by its title.
 *
 * `declaredHeading` says the extractor labelled the surrounding block as a heading. It is what
 * separates "1 OBJET" -- a clause of a Moroccan standard -- from "1 Les personnes concernées
 * peuvent…", an enumerated obligation inside an article. Without a label to go on, a
 * single-level number only opens a clause when it is typeset as a heading, in capitals.
 */
function matchIsoClause(line: string, declaredHeading: boolean): HeadingMatch | null {
  const match = isoClause.exec(line);
  if (!match) return null;
  const identifier = match[1] ?? "";
  const title = match[2]?.trim() ?? "";
  if (thousandsSeparated.test(identifier)) return null;
  // A clause title opens a heading, not a sentence: it starts on a capital and stays short.
  if (title.length > MAX_HEADING_LENGTH || !/^[\p{Lu}\p{N}]/u.test(title)) return null;
  if (!identifier.includes(".") && !declaredHeading && title !== title.toUpperCase()) return null;
  return { type: "clause", identifier, title };
}

function matchHeading(line: string, declaredHeading = false): HeadingMatch | null {
  if (tableOfContentsEntry.test(line)) return null;
  const fr = frenchArticle.exec(line);
  if (fr)
    return {
      type: "article",
      identifier: frenchArticleIdentifier(fr[1] ?? ""),
      title: headingTitle(fr[2]),
    };
  const ar = arabicArticle.exec(line);
  if (ar)
    return {
      type: "article",
      identifier: `${ar[1] ?? ""} ${normalizeDigits(ar[2] ?? "")
        .replace(/\s+/gu, " ")
        .trim()}`.trim(),
      title: headingTitle(ar[3]),
    };
  const clause = matchIsoClause(line, declaredHeading);
  if (clause) return clause;
  const annexMatch = annex.exec(line);
  if (annexMatch)
    return {
      type: "annex",
      identifier: annexMatch[1] ? `Annexe ${annexMatch[1]}` : "Annexe",
      title: headingTitle(annexMatch[2]),
    };
  const definitionMatch = definition.exec(line);
  if (definitionMatch)
    return { type: "definition", identifier: null, title: headingTitle(definitionMatch[1]) };
  const noteMatch = note.exec(line);
  if (noteMatch) return { type: "note", identifier: null, title: headingTitle(noteMatch[1]) };
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
const containerHeadings: Array<{ keywords: Set<string>; rank: number }> = [
  { keywords: new Set(["titre", "partie", "livre", "الباب"]), rank: 1 },
  { keywords: new Set(["chapitre", "chapter", "القسم"]), rank: 2 },
  { keywords: new Set(["sous-section", "section", "الفرع"]), rank: 3 },
];
// A labeled heading naming no article or clause ("Des infractions et des sanctions") is a
// container too, but its depth is unknown, so it nests below every named container.
const unnamedContainerRank = 4;

// Front matter is never an ancestor of anything. An extractor inferring heading depth from
// typography reads a cover page's larger type as an outer level, which made "SOMMAIRE" and
// "Avant-Propos National" parents of every clause in the standard that followed them -- and put
// both labels into the text embedded for each one. Their own text is still kept; only their
// claim to govern what comes after is refused.
const frontMatterHeading =
  /^\s*(?:sommaire|table\s+des\s+mati[èe]res|table\s+of\s+contents|contents|avant[-\s]propos|foreword|pr[ée]face|droits?\s+d.auteur|copyright|الفهرس|تقديم)\b/iu;

// A container heading is its keyword, an ordinal, and at most a short title: "Chapitre II",
// "Section première – Définitions". Roman numerals stay case-sensitive so an ordinary lowercase
// word ("civil") cannot pass for one.
const containerOrdinal = /^(?:premi(?:er|ère|ere)|unique|[IVXLCDM]+|\d+|[؀-ۿ]+)$/u;
// OCR reads a roman numeral's I as a lowercase l or a digit 1 constantly -- a real full-page
// pass returned "Chapitre Il" for "Chapitre II", which then failed to open a chapter and left
// every article under it attributed to the previous one. Only tokens that become a pure roman
// numeral after the substitution are accepted, so an ordinary word ("civil") still cannot pass.
const romanOcrVariants = /[l1]/gu;
const titleSeparator = /^[:.\-–—]/u;
const lowercaseLatin = /\p{Ll}/u;

/**
 * Reads the depth of a container heading, or null when the line merely starts with its keyword.
 *
 * Blocks keep the line wrapping of the page, so a body line can begin "chapitre premier de la
 * présente loi sont applicables". Treating that as a container closed whatever article was open
 * and split it in half. Demanding an ordinal, and then a title that is either set off by a
 * separator or typeset in capitals, is what tells the heading apart from the prose.
 */
function containerRank(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > MAX_HEADING_LENGTH) return null;
  if (tableOfContentsEntry.test(trimmed)) return null;
  const [keyword = "", ordinal = "", ...rest] = trimmed.split(/\s+/u);
  const entry = containerHeadings.find(({ keywords }) => keywords.has(keyword.toLowerCase()));
  const roman = ordinal.replace(romanOcrVariants, "I");
  if (!entry || !(containerOrdinal.test(ordinal) || containerOrdinal.test(roman))) return null;
  const tail = rest.join(" ");
  if (tail && !titleSeparator.test(tail) && lowercaseLatin.test(tail)) return null;
  return entry.rank;
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
// An article's keyword and its number are one heading, but a column break can leave them as two
// layout items -- "Article" on one, "14" on the next. Neither half means anything alone, so the
// article is lost entirely and its text joins whatever came before it.
const bareArticleKeyword = /^(?:article|art\.?|المادة|الفصل)$/iu;
const bareArticleNumber = /^(?:premier|unique|[\d٠-٩۰-۹]+)$/iu;

function joinSplitArticleHeadings(blocks: readonly ExtractedBlock[]): ExtractedBlock[] {
  const joined: ExtractedBlock[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block) continue;
    const next = blocks[index + 1];
    if (
      next &&
      bareArticleKeyword.test(block.text.trim()) &&
      bareArticleNumber.test(next.text.trim())
    ) {
      joined.push({ ...block, text: `${block.text.trim()} ${next.text.trim()}` });
      index += 1;
      continue;
    }
    joined.push(block);
  }
  return joined;
}

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

  /**
   * Takes a heading that follows an article's number as that article's title.
   *
   * The Bulletin officiel sets an article as its number, then its title, then its body -- and
   * the extractor labels both the number and the title as headings. Reading the second one as a
   * new container closed the article on its own number, leaving "Article 6" as a nine-character
   * provision while its text went to a container named after the title.
   */
  const adoptAsTitle = (line: string, pageNumber: number): boolean => {
    const open = current;
    if (!open || open.title !== null || open.sourceIdentifier === null) return false;
    // Closing a block appends a blank separator, so "nothing but its own heading" is a count of
    // the lines that carry text rather than of the lines held.
    if (open.lines.filter((entry) => entry.trim()).length !== 1) return false;
    open.title = line;
    // The title belongs on the heading's own line, not a paragraph below it.
    while (open.lines.at(-1) === "") open.lines.pop();
    open.lines.push(line);
    open.pageEnd = pageNumber;
    // The heading path names the provision, so it has to carry the title too.
    open.headingPath = [
      ...open.headingPath.slice(0, -1),
      [open.sourceIdentifier, line].filter(Boolean).join(" — "),
    ];
    return true;
  };

  const separate = () => {
    const open = current;
    if (open && open.lines.at(-1) !== "") open.lines.push("");
  };

  for (const block of joinSplitArticleHeadings(blocks)) {
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
      const heading = matchHeading(line, declaredHeading);
      if (heading) {
        openProvision(heading, line, block.pageNumber);
        openedHere = true;
        continue;
      }
      if (declaredHeading && !openedHere) {
        if (adoptAsTitle(line, block.pageNumber)) continue;
        if (frontMatterHeading.test(line)) {
          flush();
          append(line, block.pageNumber);
          continue;
        }
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

/**
 * How much of a segmented document is worth trusting, and why.
 *
 * The failure this exists to catch is the quiet one. An extraction that goes badly still
 * produces provisions, still produces chunks, and still passes every count-based check in the
 * pipeline -- it simply produces the wrong ones, and nobody finds out until a reviewer reads
 * them or a citation points at the wrong article. These signals are all derived from structure
 * the segmenter already computed, so they cost nothing to take, and they are what should decide
 * whether a document is worth spending a model call on.
 */
export type StructureSignals = {
  provisions: number;
  identified: number;
  /** Share of provisions carrying an article or clause identifier. */
  identifierCoverage: number;
  /** Numbers absent from an otherwise contiguous run, e.g. article 14 between 13 and 15. */
  missingNumbers: number[];
  /** Identifiers that opened a provision more than once. */
  duplicateIdentifiers: string[];
  /** Identified provisions too short to be the article they claim to be. */
  fragments: number;
  /** Share of provisions that are unidentified running text. */
  orphanRatio: number;
  /** Share of blocks the extractor gave a meaningful layout label. */
  labelledBlockRatio: number;
};

export type StructureQuality = {
  score: number;
  signals: StructureSignals;
  concerns: string[];
};

// An article that survives segmentation as a couple of dozen characters is its own heading with
// the body left behind somewhere else -- the shape a real Bulletin officiel page produced when
// an article's title was read as a new section.
const MIN_PROVISION_CHARACTERS = 120;
// Below this a document should not be published on the strength of its structure alone: either
// a reviewer looks at it or it goes down a more expensive extraction path.
export const STRUCTURE_REVIEW_THRESHOLD = 0.7;

const genericBlockTypes = new Set(["text", "paragraph", "", "unknown"]);

function provisionNumber(identifier: string): number | null {
  if (/^article\s+premier$/iu.test(identifier)) return 1;
  const article = /^(?:article|المادة|الفصل)\s+(\d+)/iu.exec(identifier);
  if (article?.[1]) return Number(article[1]);
  // Only a top-level clause takes part in a sequence; "4.1" belongs to a run of its own and
  // standards routinely skip subclauses without anything being wrong.
  const clause = /^(\d+)$/u.exec(identifier);
  return clause?.[1] ? Number(clause[1]) : null;
}

export function assessStructureQuality(
  blocks: readonly ExtractedBlock[],
  provisions: readonly NormativeProvision[],
): StructureQuality {
  const identifiedProvisions = provisions.filter((provision) => provision.sourceIdentifier);
  const seen = new Map<string, number>();
  for (const provision of identifiedProvisions) {
    const identifier = provision.sourceIdentifier ?? "";
    seen.set(identifier, (seen.get(identifier) ?? 0) + 1);
  }
  const numbers = [
    ...new Set(
      identifiedProvisions
        .map((provision) => provisionNumber(provision.sourceIdentifier ?? ""))
        .filter((value): value is number => value !== null),
    ),
  ].sort((a, b) => a - b);
  // A run is only expected to be contiguous from its own start: a document that opens at
  // article 30 because it amends another one is not missing the first twenty-nine.
  const first = numbers.at(0) ?? 0;
  const last = numbers.at(-1) ?? 0;
  const missingNumbers = numbers.length
    ? Array.from({ length: last - first + 1 }, (_, offset) => first + offset).filter(
        (value) => !numbers.includes(value),
      )
    : [];

  const signals: StructureSignals = {
    provisions: provisions.length,
    identified: identifiedProvisions.length,
    identifierCoverage: provisions.length ? identifiedProvisions.length / provisions.length : 0,
    missingNumbers,
    duplicateIdentifiers: [...seen]
      .filter(([, count]) => count > 1)
      .map(([identifier]) => identifier),
    fragments: identifiedProvisions.filter(
      (provision) => provision.content.length < MIN_PROVISION_CHARACTERS,
    ).length,
    orphanRatio: provisions.length
      ? provisions.filter((provision) => !provision.sourceIdentifier).length / provisions.length
      : 0,
    labelledBlockRatio: blocks.length
      ? blocks.filter((block) => !genericBlockTypes.has(block.blockType.toLowerCase())).length /
        blocks.length
      : 0,
  };

  const concerns: string[] = [];
  let score = 1;
  const penalise = (amount: number, concern: string) => {
    score -= amount;
    concerns.push(concern);
  };

  if (!provisions.length) {
    return { score: 0, signals, concerns: ["no provisions were segmented"] };
  }
  if (!signals.identified) {
    penalise(0.5, "no provision carries an article or clause identifier");
  }
  // A gap in the numbering is the one signal that cannot be explained away: articles are
  // consecutive by construction, so a missing number is a boundary the segmenter did not find.
  if (missingNumbers.length) {
    const expected = last - first + 1;
    penalise(
      Math.min(0.5, (missingNumbers.length / expected) * 1.5),
      `numbering skips ${missingNumbers.slice(0, 8).join(", ")}${missingNumbers.length > 8 ? "…" : ""}`,
    );
  }
  if (signals.duplicateIdentifiers.length) {
    penalise(
      Math.min(0.2, signals.duplicateIdentifiers.length * 0.05),
      `${signals.duplicateIdentifiers.length} identifier(s) opened a provision more than once`,
    );
  }
  if (signals.fragments) {
    penalise(
      Math.min(0.3, (signals.fragments / Math.max(signals.identified, 1)) * 0.6),
      `${signals.fragments} identified provision(s) hold under ${MIN_PROVISION_CHARACTERS} characters`,
    );
  }
  // Front matter and preambles are legitimately unidentified, so this only bites once most of
  // the document is running text nobody could cite.
  if (signals.orphanRatio > 0.5) {
    penalise(
      Math.min(0.2, (signals.orphanRatio - 0.5) * 0.4),
      `${Math.round(signals.orphanRatio * 100)}% of provisions carry no identifier`,
    );
  }
  if (blocks.length && signals.labelledBlockRatio < 0.05) {
    penalise(0.1, "the extractor returned no layout labels to segment on");
  }

  return { score: Math.max(0, Math.min(1, Number(score.toFixed(3)))), signals, concerns };
}

// Measured against cl100k_base, the encoder the text-embedding-3 models use: French runs about
// 4.1 characters to a token, Arabic about 1.44. Counting characters and dividing by four -- as
// this did -- is accurate for French and under-reports Arabic by a factor of nearly three.
const LATIN_CHARACTERS_PER_TOKEN = 4;
const ARABIC_CHARACTERS_PER_TOKEN = 1.4;
// `\w` stays ASCII-only in JavaScript even under the `u` flag, so a class built from it counts
// no Arabic letters at all and quietly charges an Arabic document at the Latin rate.
const arabicLetter = /\p{Script=Arabic}/u;
const anyLetter = /\p{L}/u;

/**
 * Estimates how many tokens a string will cost the embedding model.
 *
 * Splitting the text's characters between the two rates in proportion to its letters holds to
 * within 3% on French, on Arabic, and on documents that mix them -- and errs high, so a budget
 * built on it is not quietly exceeded. Blending the two *rates* instead of the character counts
 * is the tempting version and it under-reports mixed text by a fifth.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let letters = 0;
  let arabic = 0;
  for (const character of text) {
    if (!anyLetter.test(character)) continue;
    letters += 1;
    if (arabicLetter.test(character)) arabic += 1;
  }
  const arabicShare = letters ? arabic / letters : 0;
  return Math.ceil(
    (text.length * arabicShare) / ARABIC_CHARACTERS_PER_TOKEN +
      (text.length * (1 - arabicShare)) / LATIN_CHARACTERS_PER_TOKEN,
  );
}

// Whatever the budget, a provision's metadata prefix must not squeeze its actual text out.
const MIN_CONTENT_TOKENS = 128;

// French and Arabic sentence ends. Splitting here rather than at an arbitrary character offset
// is what stops a chunk boundary landing in the middle of an obligation.
const sentenceBoundary = /(?<=[.!?؟۔])\s+/u;

function splitToBudget(text: string, maxTokens: number): string[] {
  if (estimateTokens(text) <= maxTokens) return [text];
  const pieces = text.split(sentenceBoundary).filter(Boolean);
  if (pieces.length === 1) {
    // One sentence larger than the whole budget: fall back to whole words, which at least keeps
    // the split off the middle of one.
    const words = text.split(/\s+/u).filter(Boolean);
    const parts: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && estimateTokens(candidate) > maxTokens) {
        parts.push(current);
        current = word;
        continue;
      }
      current = candidate;
    }
    if (current) parts.push(current);
    return parts;
  }
  return pieces.flatMap((piece) => splitToBudget(piece, maxTokens));
}

function splitLongContent(content: string, maxTokens: number): string[] {
  if (estimateTokens(content) <= maxTokens) return [content];
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    for (const part of splitToBudget(paragraph, maxTokens)) {
      const candidate = current ? `${current}\n\n${part}` : part;
      if (current && estimateTokens(candidate) > maxTokens) {
        chunks.push(current);
        current = part;
        continue;
      }
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [content];
}

export type ChunkContext = {
  documentTitle: string;
  referenceNumber?: string | null;
  sourceEdition?: string | null;
};

/**
 * Splits provisions into the units that get embedded and searched.
 *
 * The budget is in tokens rather than characters because the corpus is bilingual: the same
 * character budget buys nearly three times as much Arabic as French, so a character-sized chunk
 * packed far more of an Arabic provision into one vector than of a French one, and Arabic
 * retrieval was the coarser for it. The metadata prefix is charged against the same budget --
 * it is embedded along with the content, so leaving it out of the accounting understated every
 * chunk.
 *
 * A provision that has to be split can end on a short chunk. Folding that tail back into its
 * predecessor is the obvious remedy and it is a mirage: packing is greedy, so the last two
 * chunks exceed the budget together by construction -- that is why they were split. Evening the
 * pair out is the real fix and is not worth its machinery until a corpus shows it matters.
 *
 * Chunks deliberately do not overlap. They are the retrieval index, not the unit anything reads:
 * a hit on a chunk pulls up its whole provision downstream, so a chunk only has to be findable,
 * and duplicated text would cost precision in both search and the excerpts reviewers see.
 */
export function chunkNormativeProvisions(
  provisions: readonly NormativeProvision[],
  context: ChunkContext,
  maxTokens = 1_500,
): NormativeChunk[] {
  let chunkIndex = 0;
  return provisions.flatMap((provision) => {
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
    const prefix = metadata.join("\n");
    const contentBudget = Math.max(
      MIN_CONTENT_TOKENS,
      maxTokens - estimateTokens(prefix ? `${prefix}\n` : ""),
    );
    return splitLongContent(provision.content, contentBudget).map((content) => {
      const searchText = [...metadata, content].join("\n");
      return {
        provisionOrderIndex: provision.orderIndex,
        chunkIndex: chunkIndex++,
        content,
        searchText,
        embeddingText: searchText,
        contentHash: sha256(content),
        tokenCount: estimateTokens(searchText),
        language: provision.language,
        headingPath: provision.headingPath,
        pageStart: provision.pageStart,
        pageEnd: provision.pageEnd,
      };
    });
  });
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

// A citation reaches retrieval in whichever form its author typed: "Art. 12" for "Article 12",
// Arabic-Indic digits for ASCII ones, "الفصل" where a dahir is being quoted. The reference is
// normalized to the same spelling `matchHeading` stores, so an exact-reference lookup can hit.
export function extractExactReference(query: string): string | null {
  const match = query.match(
    /\b(?:article\s+)?\d+(?:\.\d+)+(?:\b|$)|\b(?:article|art\.|art)\s+(?:premier|unique|\d+(?:[-–]\d+)?)\b|(?:المادة|الفصل)\s+[\d٠-٩۰-۹]+/iu,
  );
  const reference = normalizeDigits(match?.[0]?.trim() ?? "");
  if (!reference) return null;
  return reference.replace(/^art\.?\s+/iu, "article ");
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
