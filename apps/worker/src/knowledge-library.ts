import { embeddingModel, embeddingProviderOptions } from "@qhse/ai";
import {
  aiDiscoveryKnowledgePayloadSchema,
  aiEvaluationKnowledgePayloadSchema,
  type AiKnowledgeFeature,
} from "@qhse/contracts";
import { embeddingProviderSchema } from "@qhse/config";
import { Prisma, type DatabaseClient } from "@qhse/database";
import { embed } from "ai";

type PromptKnowledgeExample = {
  id: string;
  feature: AiKnowledgeFeature;
  title: string;
  scenarioSummary: string;
  guidance: string | null;
  jurisdiction: string;
  language: string;
  tags: string[];
  rating: number | null;
  expectedResult: string | null;
  evaluationSignal: string | null;
  payload: unknown;
};

type EmbeddableKnowledgeExample = Omit<PromptKnowledgeExample, "id"> & {
  sourceOrganizationId?: string | null;
  sourceProjectId?: string | null;
};

export function knowledgeEmbeddingInput(example: EmbeddableKnowledgeExample): string {
  const payload =
    example.feature === "DISCOVERY"
      ? aiDiscoveryKnowledgePayloadSchema.parse(example.payload)
      : aiEvaluationKnowledgePayloadSchema.parse(example.payload);
  return JSON.stringify({
    feature: example.feature,
    title: example.title,
    scenarioSummary: example.scenarioSummary,
    guidance: example.guidance,
    jurisdiction: example.jurisdiction,
    language: example.language,
    tags: example.tags,
    rating: example.rating,
    expectedResult: example.expectedResult,
    evaluationSignal: example.evaluationSignal,
    payload,
  });
}

export async function searchForPrompt(
  database: DatabaseClient,
  input: {
    feature: AiKnowledgeFeature;
    queryText: string;
    jurisdiction: string;
    language: string;
    limit?: number;
  },
): Promise<PromptKnowledgeExample[]> {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 5);
  const where = {
    feature: input.feature,
    status: "ACTIVE" as const,
    embeddingStatus: "COMPLETED" as const,
    jurisdiction: input.jurisdiction,
    language: input.language,
  };
  const profile = await database.embeddingProfile.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { version: "desc" },
  });
  if (profile?.dimensions === 768) {
    try {
      const provider = embeddingProviderSchema.parse(profile.provider);
      const result = await embed({
        model: embeddingModel({ provider, model: profile.model, purpose: "query" }),
        value: input.queryText,
        maxRetries: 2,
        providerOptions: embeddingProviderOptions(provider, "query"),
        telemetry: { isEnabled: false },
      });
      if (result.embedding.length === 768) {
        const vector = `[${result.embedding.join(",")}]`;
        const ranked = await database.$queryRaw<Array<{ knowledgeExampleId: string }>>(Prisma.sql`
          SELECT embedding."knowledge_example_id" AS "knowledgeExampleId"
          FROM "ai_knowledge_embeddings" embedding
          JOIN "ai_knowledge_examples" example
            ON example."id" = embedding."knowledge_example_id"
          WHERE embedding."embedding_profile_id" = ${profile.id}
            AND example."feature"::text = ${input.feature}
            AND example."status"::text = 'ACTIVE'
            AND example."embedding_status"::text = 'COMPLETED'
            AND example."jurisdiction" = ${input.jurisdiction}
            AND example."language" = ${input.language}
          ORDER BY embedding."embedding" <=> ${vector}::vector
          LIMIT ${limit}
        `);
        if (ranked.length) {
          const ids = ranked.map(({ knowledgeExampleId }) => knowledgeExampleId);
          const examples = await database.aiKnowledgeExample.findMany({
            where: { ...where, id: { in: ids } },
          });
          const byId = new Map(examples.map((example) => [example.id, toPromptExample(example)]));
          return ids.flatMap((id) => {
            const example = byId.get(id);
            return example ? [example] : [];
          });
        }
      }
    } catch {
      // Provider and vector failures fall back to deterministic active-example retrieval.
    }
  }
  const examples = await database.aiKnowledgeExample.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return examples.map(toPromptExample);
}

function toPromptExample(example: {
  id: string;
  feature: AiKnowledgeFeature;
  title: string;
  scenarioSummary: string;
  guidance: string | null;
  jurisdiction: string;
  language: string;
  tags: string[];
  rating: number | null;
  expectedResult: string | null;
  evaluationSignal: string | null;
  payload: Prisma.JsonValue;
}): PromptKnowledgeExample {
  const payload =
    example.feature === "DISCOVERY"
      ? aiDiscoveryKnowledgePayloadSchema.parse(example.payload)
      : aiEvaluationKnowledgePayloadSchema.parse(example.payload);
  return {
    id: example.id,
    feature: example.feature,
    title: example.title,
    scenarioSummary: example.scenarioSummary,
    guidance: example.guidance,
    jurisdiction: example.jurisdiction,
    language: example.language,
    tags: example.tags,
    rating: example.rating,
    expectedResult: example.expectedResult,
    evaluationSignal: example.evaluationSignal,
    payload,
  };
}
