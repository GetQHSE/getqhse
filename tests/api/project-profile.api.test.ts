import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ServerAuthError } from "@qhse/auth";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticationPort } from "../../apps/client-api/src/modules/auth/application/auth.port.js";
import { TenantContextGuard } from "../../apps/client-api/src/modules/auth/authorization/tenant-context.guard.js";
import { ProjectProfilesService } from "../../apps/client-api/src/modules/project-profile/application/project-profiles.service.js";
import { ProjectProfilesController } from "../../apps/client-api/src/modules/project-profile/presentation/project-profiles.controller.js";

describe("project profile API", () => {
  let app: INestApplication;
  const tenant = { organizationId: "org-1", userId: "user-1", role: "member" };
  const authentication = {
    requireAuth: vi.fn(),
    requireOrganization: vi.fn(),
  };
  const profiles = {
    get: vi.fn(),
    update: vi.fn(),
    getConversation: vi.fn(),
    chat: vi.fn(),
    streamChat: vi.fn(),
    complete: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    authentication.requireAuth.mockResolvedValue({ id: "user-1", email: "user@example.test" });
    authentication.requireOrganization.mockResolvedValue(tenant);
    const module = await Test.createTestingModule({
      controllers: [ProjectProfilesController],
      providers: [
        TenantContextGuard,
        { provide: AuthenticationPort, useValue: authentication },
        { provide: ProjectProfilesService, useValue: profiles },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => app.close());

  it("protects every profile endpoint with tenant authentication", async () => {
    authentication.requireAuth.mockRejectedValue(
      new ServerAuthError(401, "Authentication required"),
    );
    await request(app.getHttpServer()).get("/v1/projects/project-1/profile").expect(401);
    expect(profiles.get).not.toHaveBeenCalled();
  });

  it("returns the canonical tenant-scoped profile", async () => {
    profiles.get.mockResolvedValue({ profile: { id: "profile-1", revision: 1 } });
    await request(app.getHttpServer())
      .get("/v1/projects/project-1/profile")
      .set("x-organization-id", "org-1")
      .expect(200)
      .expect({ profile: { id: "profile-1", revision: 1 } });
    expect(profiles.get).toHaveBeenCalledWith(tenant, "project-1");
  });

  it("validates and forwards manual profile edits with optimistic revision control", async () => {
    profiles.update.mockResolvedValue({ profile: { revision: 8 } });
    await request(app.getHttpServer())
      .patch("/v1/projects/project-1/profile")
      .send({
        revision: 7,
        answers: [{ key: "organization.employeeCount", value: 42 }],
        changeReason: "Correction utilisateur",
      })
      .expect(200)
      .expect({ profile: { revision: 8 } });
    expect(profiles.update).toHaveBeenCalledWith(
      tenant,
      "project-1",
      expect.objectContaining({ revision: 7 }),
    );
  });

  it("exposes a separate chat turn and completion command", async () => {
    profiles.chat.mockResolvedValue({ conversationId: "conversation-1" });
    profiles.complete.mockResolvedValue({ id: "snapshot-1", sequence: 1 });

    await request(app.getHttpServer())
      .post("/v1/projects/project-1/profile/chat")
      .send({ message: "Nous employons 42 personnes", language: "fr" })
      .expect(201)
      .expect({ conversationId: "conversation-1" });
    await request(app.getHttpServer())
      .post("/v1/projects/project-1/profile/complete")
      .send({ revision: 8 })
      .expect(201)
      .expect({ id: "snapshot-1", sequence: 1 });

    expect(profiles.chat).toHaveBeenCalledWith(
      tenant,
      "project-1",
      expect.objectContaining({ language: "fr" }),
    );
    expect(profiles.complete).toHaveBeenCalledWith(tenant, "project-1", 8);
  });

  it("streams AI SDK UI message events", async () => {
    profiles.streamChat.mockResolvedValue({
      pipe: async (response: import("node:http").ServerResponse) => {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end('data: {"type":"finish"}\n\ndata: [DONE]\n\n');
      },
    });
    const response = await request(app.getHttpServer())
      .post("/v1/projects/project-1/profile/chat/stream")
      .send({
        messages: [
          { id: "client-turn-1", role: "user", parts: [{ type: "text", text: "Bonjour" }] },
        ],
        language: "fr",
      })
      .expect(200)
      .expect("content-type", /text\/event-stream/);
    expect(response.text).toContain("[DONE]");
    expect(profiles.streamChat).toHaveBeenCalledWith(
      tenant,
      "project-1",
      expect.objectContaining({ language: "fr" }),
    );
  });
});
