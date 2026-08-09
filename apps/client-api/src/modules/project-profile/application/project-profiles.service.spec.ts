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
});
