import type { DatabaseClient } from "@qhse/database";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticationPort } from "./auth.port.js";
import { UserPreferencesService } from "./user-preferences.service.js";

function setup(storedLocale: string | null) {
  const authentication = {
    requireAuth: vi.fn().mockResolvedValue({ id: "user_1" }),
  } as unknown as AuthenticationPort;
  const update = vi.fn().mockResolvedValue({});
  const database = {
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue(storedLocale === null ? null : { locale: storedLocale }),
      update,
    },
  } as unknown as DatabaseClient;
  return { service: new UserPreferencesService(authentication, database), update };
}

describe("UserPreferencesService", () => {
  it("normalizes a legacy regional locale to a supported language", async () => {
    await expect(setup("fr-MA").service.get({})).resolves.toEqual({ locale: "fr" });
    await expect(setup("ar").service.get({})).resolves.toEqual({ locale: "ar" });
    await expect(setup("de-DE").service.get({})).resolves.toEqual({ locale: "fr" });
  });

  it("stores a supported interface language for the current user", async () => {
    const { service, update } = setup("fr-MA");
    await expect(service.update({}, { locale: "en" })).resolves.toEqual({ locale: "en" });
    expect(update).toHaveBeenCalledWith({ where: { id: "user_1" }, data: { locale: "en" } });
  });

  it("rejects an unsupported language", async () => {
    const { service, update } = setup("fr");
    await expect(service.update({}, { locale: "de" })).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
});
