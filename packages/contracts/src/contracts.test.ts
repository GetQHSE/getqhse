import { describe, expect, it } from "vitest";

import {
  apiErrorSchema,
  createAiKnowledgeExampleSchema,
  createRegulatoryActionSchema,
  createSiteSchema,
  createFileUploadSchema,
  decideRegulatoryCandidateSchema,
  regulatoryEvidencePayloadIssue,
  reviewRegulatoryAnalysisSchema,
  updateRegulatoryActionSchema,
  updateRegulatoryEvidenceSchema,
  projectProfileAnswerInputSchema,
  projectProfileStreamRequestSchema,
  updateProjectProfileSchema,
} from "./index.js";

describe("public contracts", () => {
  it("rejects an empty site code", () => {
    expect(
      createSiteSchema.safeParse({ name: "Casablanca plant", code: "", address: null }).success,
    ).toBe(false);
  });

  it("requires request tracing on API errors", () => {
    expect(
      apiErrorSchema.safeParse({
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Missing",
        timestamp: new Date().toISOString(),
        path: "/sites/1",
      }).success,
    ).toBe(false);
  });

  it("requires profile revision control and valid not-applicable reasons", () => {
    expect(
      updateProjectProfileSchema.safeParse({
        revision: 2,
        answers: [{ key: "organization.mission", value: "Servir nos clients" }],
      }).success,
    ).toBe(true);
    expect(
      projectProfileAnswerInputSchema.safeParse({
        key: "operations.recurrentIssues",
        status: "NOT_APPLICABLE",
      }).success,
    ).toBe(false);
  });

  it("accepts AI SDK UI messages and rejects unsupported attachment counts", () => {
    expect(
      projectProfileStreamRequestSchema.safeParse({
        messages: [{ id: "user-1", role: "user", parts: [{ type: "text", text: "Bonjour" }] }],
      }).success,
    ).toBe(true);
    expect(
      projectProfileStreamRequestSchema.safeParse({
        messages: [{ id: "user-1", role: "user", parts: [{ type: "text", text: "Bonjour" }] }],
        attachmentIds: Array.from({ length: 11 }, (_, index) => `file-${index}`),
      }).success,
    ).toBe(false);
  });

  it("requires a SHA-256 checksum for durable uploads", () => {
    expect(
      createFileUploadSchema.safeParse({
        fileName: "voice.webm",
        contentType: "audio/webm",
        sizeBytes: 1_024,
        checksum: "a".repeat(64),
        purpose: "VOICE_NOTE",
      }).success,
    ).toBe(true);
    expect(
      createFileUploadSchema.safeParse({
        fileName: "voice.webm",
        contentType: "audio/webm",
        sizeBytes: 1_024,
        checksum: "not-a-checksum",
      }).success,
    ).toBe(false);
  });

  it("allows an applicable regulatory decision to omit an override, defaulting to the AI's wording", () => {
    expect(
      decideRegulatoryCandidateSchema.safeParse({
        watchRevision: 2,
        decision: "APPLICABLE",
      }).success,
    ).toBe(true);
    expect(
      decideRegulatoryCandidateSchema.safeParse({
        watchRevision: 2,
        decision: "APPLICABLE",
        requirementText:
          "L’organisme doit déterminer et suivre les enjeux pertinents pour son système de management.",
      }).success,
    ).toBe(true);
    expect(
      decideRegulatoryCandidateSchema.safeParse({
        watchRevision: 2,
        decision: "NOT_APPLICABLE",
      }).success,
    ).toBe(true);
  });

  it("rejects an override that is too short to be genuine wording", () => {
    expect(
      decideRegulatoryCandidateSchema.safeParse({
        watchRevision: 2,
        decision: "APPLICABLE",
        requirementText: "Trop court",
      }).success,
    ).toBe(false);
  });

  it("accepts zero-to-five analysis reviews and keeps skips empty", () => {
    expect(
      reviewRegulatoryAnalysisSchema.safeParse({
        outcome: "SUBMITTED",
        rating: 0,
        comment: "Résultat inutilisable",
      }).success,
    ).toBe(true);
    expect(
      reviewRegulatoryAnalysisSchema.safeParse({ outcome: "SUBMITTED", rating: 6 }).success,
    ).toBe(false);
    expect(
      reviewRegulatoryAnalysisSchema.safeParse({ outcome: "SKIPPED", rating: 3 }).success,
    ).toBe(false);
  });

  it("validates feature-specific knowledge examples and rejects unsafe prompt-visible text", () => {
    expect(
      createAiKnowledgeExampleSchema.safeParse({
        feature: "DISCOVERY",
        title: "Installations classées au Maroc",
        scenarioSummary: "Site industriel avec stockage de produits dangereux.",
        guidance: "Retenir les textes seulement lorsque les seuils sont plausibles.",
        jurisdiction: "MA",
        language: "fr",
        tags: ["industrie", "stockage"],
        rating: 4,
        payload: {
          includedLaws: [
            {
              reference: "Loi 11-03",
              title: "Protection de l'environnement",
              reason: "L'activité présente des impacts environnementaux potentiels.",
            },
          ],
          excludedLaws: [],
        },
      }).success,
    ).toBe(true);
    expect(
      createAiKnowledgeExampleSchema.safeParse({
        feature: "CONFORMITY_EVALUATION",
        title: "Évaluation d'une obligation documentaire",
        scenarioSummary: "Contacter qhse@example.com pour consulter https://private.test/file.",
        guidance: null,
        jurisdiction: "MA",
        language: "fr",
        tags: [],
        expectedResult: "PARTIAL",
        evaluationSignal: "CORRECTION",
        payload: {
          lawReference: "Loi 11-03",
          lawTitle: "Protection de l'environnement",
          requirementSummary: "Conserver une preuve documentaire à jour.",
          rationale: "La preuve existe mais sa validation est expirée.",
          remediationGuidance: "Faire valider la preuve mise à jour.",
        },
      }).success,
    ).toBe(false);
  });
});

describe("regulatory action and evidence patches", () => {
  it("leaves an absent status or effectiveness untouched instead of resetting it", () => {
    expect(updateRegulatoryActionSchema.parse({ responsibleName: "Responsable QHSE" })).toEqual({
      responsibleName: "Responsable QHSE",
    });
    // The create schema still seeds a brand-new action with sensible defaults.
    expect(createRegulatoryActionSchema.parse({ title: "Créer le registre" })).toMatchObject({
      status: "OPEN",
      effectiveness: "PENDING",
    });
  });

  it("carries the free-text responsable a reviewer types over the AI proposal", () => {
    expect(
      updateRegulatoryActionSchema.safeParse({ responsibleName: "a".repeat(201) }).success,
    ).toBe(false);
    expect(updateRegulatoryActionSchema.safeParse({ responsibleName: null }).success).toBe(true);
  });

  it("defers the preuve payload rule to the merged record on a partial patch", () => {
    // `kind` may be absent from the patch, so the schema cannot check the pairing on its own.
    expect(updateRegulatoryEvidenceSchema.safeParse({ label: "Rapport" }).success).toBe(true);
    expect(regulatoryEvidencePayloadIssue({ kind: "NOTE", note: null })).toEqual({
      path: "note",
      message: "note is required",
    });
    expect(regulatoryEvidencePayloadIssue({ kind: "LINK", url: "https://x.test" })).toBeNull();
  });
});
