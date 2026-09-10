import "reflect-metadata";

import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlatformUsersController } from "./platform-users.controller.js";
import { PlatformUsersService } from "./platform-users.service.js";

describe("PlatformUsersController API", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  async function createApp(users: object) {
    const testingModule = await Test.createTestingModule({
      controllers: [PlatformUsersController],
      providers: [{ provide: PlatformUsersService, useValue: users }],
    }).compile();
    app = testingModule.createNestApplication();
    await app.listen(0, "127.0.0.1");
  }

  it("serves the platform operator list", async () => {
    const users = { list: vi.fn().mockResolvedValue([]) };
    await createApp(users);

    const response = await fetch(`${await app!.getUrl()}/v1/platform-users?status=active`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
    expect(users.list).toHaveBeenCalledWith(undefined, { status: "active" });
  }, 15_000);

  it("validates direct account creation before calling the service", async () => {
    const users = { create: vi.fn() };
    await createApp(users);

    const response = await fetch(`${await app!.getUrl()}/v1/platform-users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Leila",
        lastName: "Mansouri",
        email: "not-an-email",
        password: "short",
        platformRole: "super_admin",
      }),
    });

    expect(response.status).toBe(422);
    expect(users.create).not.toHaveBeenCalled();
  }, 15_000);

  it("creates an active credential account through the admin endpoint", async () => {
    const created = {
      id: "operator-1",
      name: "Leila Mansouri",
      email: "leila@example.test",
      platformRole: "content_manager",
      status: "active",
    };
    const users = { create: vi.fn().mockResolvedValue(created) };
    await createApp(users);

    const response = await fetch(`${await app!.getUrl()}/v1/platform-users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Leila",
        lastName: "Mansouri",
        email: "LEILA@example.test",
        password: "a-secure-password",
        platformRole: "content_manager",
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(created);
    expect(users.create).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        email: "leila@example.test",
        locale: "fr-MA",
        timezone: "Africa/Casablanca",
      }),
    );
  }, 15_000);
});
