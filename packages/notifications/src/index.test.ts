import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrevoTransactionalEmailProvider,
  decryptEmailSecret,
  emailCatalog,
  encryptEmailSecret,
  maskEmailAddress,
  organizationInvitationParameters,
  organizationInvitationUrl,
} from "./index.js";

describe("email configuration", () => {
  it("encrypts the Brevo API key without exposing it", () => {
    const encrypted = encryptEmailSecret("xkeysib-secret-value", "test-secret");
    expect(encrypted).not.toContain("xkeysib-secret-value");
    expect(decryptEmailSecret(encrypted, "test-secret")).toBe("xkeysib-secret-value");
    expect(decryptEmailSecret(encrypted, "wrong-secret")).toBeNull();
  });

  it("publishes the exact invitation template contract", () => {
    expect(emailCatalog.ORGANIZATION_INVITATION.requiredParameters).toEqual([
      "recipientEmail",
      "inviterName",
      "inviterEmail",
      "organizationName",
      "role",
      "invitationUrl",
      "expiresAt",
    ]);
    expect(maskEmailAddress("member@example.com")).toBe("me••••@example.com");
  });

  it("builds a safely encoded invitation URL and exact payload", () => {
    expect(organizationInvitationUrl("https://app.example.com/", "invite/with space")).toBe(
      "https://app.example.com/accept-invitation/invite%2Fwith%20space",
    );
    const parameters = organizationInvitationParameters({
      recipientEmail: "member@example.com",
      inviterName: "Owner",
      inviterEmail: "owner@example.com",
      organizationName: "Atlas",
      role: "member",
      appOrigin: "https://app.example.com/",
      invitationId: "invite-1",
      expiresAt: new Date("2026-09-11T12:00:00Z"),
    });
    expect(Object.keys(parameters)).toEqual(
      emailCatalog.ORGANIZATION_INVITATION.requiredParameters,
    );
    expect(parameters.invitationUrl).toBe("https://app.example.com/accept-invitation/invite-1");
  });
});

describe("BrevoTransactionalEmailProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a template with parameters and an idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messageId: "brevo-message-1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new BrevoTransactionalEmailProvider("secret", "https://brevo.test/v3");
    await expect(
      provider.send({
        templateId: 12,
        recipient: { email: "member@example.com", name: "Member" },
        parameters: { invitationUrl: "https://app.test/invite" },
        idempotencyKey: "delivery-1",
      }),
    ).resolves.toEqual({ messageId: "brevo-message-1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://brevo.test/v3/smtp/email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "delivery-1" }),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    if (typeof request.body !== "string") throw new Error("Expected a JSON request body");
    expect(JSON.parse(request.body)).toMatchObject({
      templateId: 12,
      params: { invitationUrl: "https://app.test/invite" },
    });
  });

  it("classifies rate limits as retryable and invalid templates as permanent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("missing", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new BrevoTransactionalEmailProvider("secret", "https://brevo.test/v3");
    await expect(provider.getTemplate(1)).rejects.toMatchObject({
      retryable: true,
      status: 429,
    });
    await expect(provider.getTemplate(2)).rejects.toMatchObject({
      retryable: false,
      status: 404,
    });
  });
});
