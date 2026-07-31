import "reflect-metadata";

import { Controller, Get, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { describe, it } from "vitest";

@Controller("health")
class TestHealthController {
  @Get("live")
  live() {
    return { status: "ok", check: "live" };
  }
}

@Module({ controllers: [TestHealthController] })
class TestApiModule {}

describe("health API", () => {
  it("responds with a stable liveness shape", async () => {
    const testingModule = await Test.createTestingModule({ imports: [TestApiModule] }).compile();
    const app = testingModule.createNestApplication();
    await app.init();
    await request(app.getHttpServer())
      .get("/health/live")
      .expect(200)
      .expect({ status: "ok", check: "live" });
    await app.close();
  });
});
