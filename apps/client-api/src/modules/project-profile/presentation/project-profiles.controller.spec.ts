import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";

import type { QhseRequest } from "../../../common/request-context.js";
import type { ProjectProfilesService } from "../application/project-profiles.service.js";
import { ProjectProfilesController } from "./project-profiles.controller.js";

describe("ProjectProfilesController conversation", () => {
  it("serializes the valid no-conversation state as JSON null", async () => {
    const getConversation = vi.fn().mockResolvedValue(null);
    const controller = new ProjectProfilesController({
      getConversation,
    } as unknown as ProjectProfilesService);
    const json = vi.fn();
    const response = {
      status: vi.fn(() => response),
      json,
    } as unknown as Response;
    const request = {
      tenant: { organizationId: "org-1", userId: "user-1", role: "member" },
    } as QhseRequest;

    await controller.conversation(request, "atlas-industrie", response);

    expect(getConversation).toHaveBeenCalledWith(request.tenant, "atlas-industrie", undefined);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(null);
  });
});
