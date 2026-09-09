import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type {
  AdminNormativeSearchResponse,
  AdminNormativeSearchResult,
  NormativeSearchRequest,
} from "@qhse/contracts";
import { llmSettings } from "@qhse/ai";
import { embeddingProviderSchema } from "@qhse/config";
import { createPrismaClient, Prisma, type DatabaseClient } from "@qhse/database";
import { extractExactReference, reciprocalRankFusion, stableCitationLabel } from "@qhse/knowledge";

import {
  NormativeQueryEmbeddingPort,
  NormativeSearchTester,
} from "../application/normative-search-testing.port.js";

type CandidateRow = {
  sourceId: string;
  documentId: string;
  revisionId: string;
  chunkId: string;
  documentTitle: string;
  referenceNumber: string | null;
  revisionLabel: string;
  sourceEdition: string | null;
  jurisdiction: string | null;
  countryCode: string | null;
  language: "fr" | "ar";
  documentFamily: "standard" | "regulation";
  provisionType: "clause" | "article" | "definition" | "annex" | "table" | "note" | "section";
  provisionIdentifier: string | null;
  headingPath: string[];
  pageStart: number | null;
  pageEnd: number | null;
  content: string;
  score: number;
};

/**
 * Runs the same hybrid retrieval as the client-facing normative search, but returns the full
 * chunk content instead of a citation-bounded excerpt and skips retrieval logging: this is a
 * platform-operator diagnostic tool for inspecting what the AI actually retrieves from the
 * embedded corpus, not a client search whose usage should be audited.
 */
@Injectable()
export class PrismaNormativeSearchTester extends NormativeSearchTester {
  private readonly database: DatabaseClient = createPrismaClient();

  constructor(
    @Inject(NormativeQueryEmbeddingPort)
    private readonly queryEmbeddings: NormativeQueryEmbeddingPort,
  ) {
    super();
  }

  async search(input: NormativeSearchRequest): Promise<AdminNormativeSearchResponse> {
    if (!llmSettings().ragEnabled) {
      throw new ServiceUnavailableException("Normative search is disabled");
    }
    const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
    const exactReference = extractExactReference(input.query);
    const profile = await this.database.embeddingProfile.findFirst({
      where: { status: "ACTIVE" },
    });
    if (!profile) throw new ServiceUnavailableException("No active embedding profile");
    const embedding = await this.queryEmbeddings.embedQuery(
      embeddingProviderSchema.parse(profile.provider),
      profile.model,
      input.query,
    );
    const vector = `[${embedding.join(",")}]`;
    const languageFilter = Prisma.join(input.languages.map((language) => Prisma.sql`${language}`));
    const familyFilter = input.documentFamilies?.length
      ? Prisma.sql`AND (CASE WHEN d."document_type" = 'standard' THEN 'standard' ELSE 'regulation' END)
          IN (${Prisma.join(input.documentFamilies.map((family) => Prisma.sql`${family}`))})`
      : Prisma.empty;
    const filters = Prisma.sql`
      v."status" = 'PUBLISHED'
      AND v."validated_at" IS NOT NULL
      AND d."status" <> 'ARCHIVED'
      AND d."deleted_at" IS NULL
      AND d."visibility" IN ('ORGANIZATION_AVAILABLE', 'PUBLIC_REFERENCE')
      AND v."storage_allowed" = true
      AND v."extraction_allowed" = true
      AND v."embedding_allowed" = true
      AND v."ai_processing_allowed" = true
      AND v."external_provider_allowed" = true
      AND v."excerpt_display_allowed" = true
      AND c."language" IN (${languageFilter})
      AND (
        d."country_code" = 'MA'
        OR (d."document_type" = 'standard' AND d."country_code" IS NULL)
        OR (d."document_type" = 'standard' AND lower(coalesce(d."jurisdiction", '')) IN ('global', 'international', 'iso'))
      )
      AND coalesce(v."effective_date", d."effective_date", v."published_at"::date) <= ${asOf}::date
      AND (coalesce(v."expiration_date", d."expiration_date") IS NULL
        OR coalesce(v."expiration_date", d."expiration_date") > ${asOf}::date)
      AND NOT EXISTS (
        SELECT 1 FROM "document_chunks" missing_chunk
        WHERE missing_chunk."document_version_id" = v."id"
          AND NOT EXISTS (
            SELECT 1 FROM "document_embeddings" missing_embedding
            WHERE missing_embedding."document_chunk_id" = missing_chunk."id"
              AND missing_embedding."embedding_profile_id" = ${profile.id}
          )
      )
      ${familyFilter}`;
    const selectColumns = Prisma.sql`
      p."id" AS "sourceId",
      d."id" AS "documentId",
      v."id" AS "revisionId",
      c."id" AS "chunkId",
      d."title" AS "documentTitle",
      d."reference_number" AS "referenceNumber",
      v."version_label" AS "revisionLabel",
      v."source_edition" AS "sourceEdition",
      d."jurisdiction" AS "jurisdiction",
      d."country_code" AS "countryCode",
      c."language" AS "language",
      CASE WHEN d."document_type" = 'standard' THEN 'standard' ELSE 'regulation' END AS "documentFamily",
      lower(p."provision_type"::text) AS "provisionType",
      p."source_identifier" AS "provisionIdentifier",
      c."heading_path" AS "headingPath",
      c."page_start" AS "pageStart",
      c."page_end" AS "pageEnd",
      c."content" AS "content"`;

    const [keywordRows, semanticRows] = await Promise.all([
      this.database.$queryRaw<CandidateRow[]>(Prisma.sql`
        SELECT ${selectColumns},
          (ts_rank_cd(c."search_vector", plainto_tsquery('simple', ${input.query}))
            + CASE WHEN ${exactReference}::text IS NOT NULL
              AND lower(coalesce(p."source_identifier", '')) = lower(${exactReference})
              THEN 2 ELSE 0 END) AS "score"
        FROM "document_chunks" c
        JOIN "document_versions" v ON v."id" = c."document_version_id"
        JOIN "documents" d ON d."id" = v."document_id"
        JOIN "document_provisions" p ON p."id" = c."document_provision_id"
        JOIN "document_embeddings" e ON e."document_chunk_id" = c."id"
          AND e."embedding_profile_id" = ${profile.id}
        WHERE ${filters}
          AND (c."search_vector" @@ plainto_tsquery('simple', ${input.query})
            OR (${exactReference}::text IS NOT NULL
              AND lower(coalesce(p."source_identifier", '')) = lower(${exactReference})))
        ORDER BY "score" DESC, c."id" ASC
        LIMIT 50`),
      this.database.$queryRaw<CandidateRow[]>(Prisma.sql`
        SELECT ${selectColumns},
          (1 - (e."embedding" <=> ${vector}::vector)
            + CASE WHEN ${exactReference}::text IS NOT NULL
              AND lower(coalesce(p."source_identifier", '')) = lower(${exactReference})
              THEN 0.25 ELSE 0 END) AS "score"
        FROM "document_embeddings" e
        JOIN "document_chunks" c ON c."id" = e."document_chunk_id"
        JOIN "document_versions" v ON v."id" = c."document_version_id"
        JOIN "documents" d ON d."id" = v."document_id"
        JOIN "document_provisions" p ON p."id" = c."document_provision_id"
        WHERE e."embedding_profile_id" = ${profile.id} AND ${filters}
        ORDER BY e."embedding" <=> ${vector}::vector, c."id" ASC
        LIMIT 50`),
    ]);
    const fused = reciprocalRankFusion(
      keywordRows.map((row, index) => ({
        id: row.chunkId,
        rank: index + 1,
        score: Number(row.score),
      })),
      semanticRows.map((row, index) => ({
        id: row.chunkId,
        rank: index + 1,
        score: Number(row.score),
      })),
      input.limit,
    );
    const byChunk = new Map([...keywordRows, ...semanticRows].map((row) => [row.chunkId, row]));
    const results = fused.flatMap((item): AdminNormativeSearchResult[] => {
      const row = byChunk.get(item.id);
      if (!row) return [];
      return [
        {
          sourceId: row.sourceId,
          documentId: row.documentId,
          revisionId: row.revisionId,
          chunkId: row.chunkId,
          documentTitle: row.documentTitle,
          referenceNumber: row.referenceNumber,
          revisionLabel: row.revisionLabel,
          sourceEdition: row.sourceEdition,
          jurisdiction: row.jurisdiction,
          countryCode: row.countryCode,
          language: row.language,
          documentFamily: row.documentFamily,
          provisionType: row.provisionType,
          provisionIdentifier: row.provisionIdentifier,
          headingPath: row.headingPath,
          pageStart: row.pageStart,
          pageEnd: row.pageEnd,
          content: row.content,
          scores: {
            keyword: item.keywordScore,
            semantic: item.semanticScore,
            fusion: item.rrfScore,
          },
          citationLabel: stableCitationLabel({
            documentTitle: row.documentTitle,
            referenceNumber: row.referenceNumber,
            revisionLabel: row.revisionLabel,
            provisionIdentifier: row.provisionIdentifier,
            pageStart: row.pageStart,
            pageEnd: row.pageEnd,
          }),
        },
      ];
    });
    return {
      results,
      asOf,
      embeddingProfile: { id: profile.id, key: profile.key, model: profile.model },
    };
  }
}
