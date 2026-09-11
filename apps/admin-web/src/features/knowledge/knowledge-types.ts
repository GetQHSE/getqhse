import type {
  AiKnowledgeEmbeddingStatus,
  AiKnowledgeEvaluationSignal,
  AiKnowledgeFeature,
  AiKnowledgeSource,
  AiKnowledgeStatus,
} from "@qhse/contracts";

export type KnowledgeExample = {
  id: string;
  feature: AiKnowledgeFeature;
  status: AiKnowledgeStatus;
  source: AiKnowledgeSource;
  title: string;
  scenarioSummary: string;
  guidance: string | null;
  jurisdiction: string;
  language: "fr" | "ar";
  tags: string[];
  payload: Record<string, unknown>;
  rating: number | null;
  expectedResult: "CONFORMING" | "PARTIAL" | "NON_CONFORMING" | null;
  evaluationSignal: AiKnowledgeEvaluationSignal | null;
  embeddingStatus: AiKnowledgeEmbeddingStatus;
  embeddingError: string | null;
  sourceOrganization: { id: string; name: string } | null;
  sourceProject: { id: string; name: string } | null;
  sourceAnalysisReview: {
    rating: number | null;
    comment: string | null;
    createdAt: string;
    run: { status: string };
  } | null;
  sourceRegulatoryEvaluation: {
    result: string;
    comment: string | null;
    aiSuggestedResult: string | null;
    evaluatedAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeListResponse = {
  items: KnowledgeExample[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};

export function featurePath(feature: AiKnowledgeFeature) {
  return feature === "DISCOVERY" ? "discovery" : "evaluation";
}

export function featureTitle(feature: AiKnowledgeFeature) {
  return feature === "DISCOVERY" ? "AI Discovery" : "AI Evaluation";
}
