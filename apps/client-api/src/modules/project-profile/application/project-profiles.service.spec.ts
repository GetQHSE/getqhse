import type { DatabaseClient } from "@qhse/database";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProfileChatModelPort } from "./profile-chat-model.port.js";
import type { FileStorage } from "../../files/application/file-storage.port.js";
import { ProjectProfilesService } from "./project-profiles.service.js";

describe("ProjectProfilesService authorization", () => {
  const model = { runTurn: vi.fn() } as unknown as ProfileChatModelPort;
  const database = {} as DatabaseClient;
  const storage = {} as FileStorage;

  afterEach(() => vi.clearAllMocks());

  it("denies manual edits before touching persistence for a read-only member", async () => {
    const service = new ProjectProfilesService(model, storage, database);
    await expect(
      service.update({ organizationId: "org-1", userId: "user-1", role: "viewer" }, "project-1", {
        revision: 1,
        answers: [{ key: "organization.mission", value: "Mission", status: "ANSWERED" }],
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("does not let required questions be bypassed with not-applicable", async () => {
    const service = new ProjectProfilesService(model, storage, database);
    await expect(
      service.update({ organizationId: "org-1", userId: "user-1", role: "owner" }, "project-1", {
        revision: 1,
        answers: [
          {
            key: "organization.mission",
            status: "NOT_APPLICABLE",
            notApplicableReason: "Non applicable",
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("keeps normative watch out of the profile prompt route", async () => {
    const service = new ProjectProfilesService(model, storage, database);
    await expect(
      service.chat({ organizationId: "org-1", userId: "user-1", role: "owner" }, "project-1", {
        message: "Analysez les nouvelles lois",
        language: "fr",
        module: "NORMATIVE_WATCH",
        attachmentIds: [],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("exports only portable profile facts without tenant identifiers", async () => {
    const service = new ProjectProfilesService(model, storage, database);
    const buildProfile = vi.fn().mockResolvedValue({
      project: {
        name: "Atlas Industrie",
        countryCode: "MA",
        standardCode: "ISO_9001",
      },
      profile: { schemaVersion: 1 },
      fields: [
        {
          key: "project.name",
          status: "CONFIRMED",
          value: "Atlas Industrie",
          notApplicableReason: null,
        },
        {
          key: "project.logoUrl",
          status: "UNANSWERED",
          value: null,
          notApplicableReason: null,
        },
      ],
    });
    (service as unknown as { buildProfile: typeof buildProfile }).buildProfile = buildProfile;

    const exported = await service.exportPortable(
      { organizationId: "org-1", userId: "user-1", role: "viewer" },
      "project-1",
    );

    expect(exported.fields).toEqual([
      { key: "project.name", status: "ANSWERED", value: "Atlas Industrie" },
    ]);
    expect(exported).not.toHaveProperty("organizationId");
    expect(exported).not.toHaveProperty("projectId");
  });

  it("rejects unsupported import schema versions before persistence", async () => {
    const service = new ProjectProfilesService(model, storage, database);
    await expect(
      service.importPortable(
        { organizationId: "org-1", userId: "user-1", role: "owner" },
        "project-1",
        {
          revision: 1,
          document: {
            format: "qhse-project-profile",
            formatVersion: 1,
            profileSchemaVersion: 99,
            exportedAt: "2026-08-11T08:00:00.000Z",
            sourceProject: {
              name: "Atlas",
              countryCode: "MA",
              standardCode: "ISO_9001",
            },
            fields: [{ key: "project.name", status: "ANSWERED", value: "Atlas" }],
          },
        },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
