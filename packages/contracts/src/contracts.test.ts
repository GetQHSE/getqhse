import { describe, expect, it } from "vitest";

import {
  apiErrorSchema,
  createSiteSchema,
  createFileUploadSchema,
  decideRegulatoryCandidateSchema,
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
});
