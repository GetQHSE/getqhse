import { afterEach, describe, expect, it, vi } from "vitest";

import {
  calendarDaysInTimeZone,
  EmailDeliveryProcessor,
  emailRetryDecision,
  regulatoryEmailTypesForRun,
} from "./email-delivery.processor.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("transactional email delivery rules", () => {
  it("retries transient failures exponentially and stops after five attempts", () => {
    const now = Date.parse("2026-09-09T12:00:00Z");
    expect(emailRetryDecision(1, true, now)).toEqual({
      status: "PENDING",
      nextAttemptAt: new Date("2026-09-09T12:01:00Z"),
    });
    expect(emailRetryDecision(4, true, now)).toEqual({
      status: "PENDING",
      nextAttemptAt: new Date("2026-09-09T12:08:00Z"),
    });
    expect(emailRetryDecision(5, true, now).status).toBe("FAILED");
    expect(emailRetryDecision(1, false, now).status).toBe("FAILED");
  });

  it("calculates reminder windows using the organization timezone", () => {
    const now = new Date("2026-09-09T23:30:00Z");
    const due = new Date("2026-09-10T00:00:00Z");
    expect(calendarDaysInTimeZone(now, due, "Africa/Casablanca")).toBe(0);
    expect(calendarDaysInTimeZone(now, due, "America/New_York")).toBe(1);
  });

  it("emits review-ready and impact as distinct document-revision events", () => {
    expect(regulatoryEmailTypesForRun("READY_FOR_REVIEW", "DOCUMENT_REVISION")).toEqual([
      "REGULATORY_REVIEW_READY",
      "REGULATORY_IMPACT",
    ]);
    expect(regulatoryEmailTypesForRun("FAILED", "DOCUMENT_REVISION")).toEqual([
      "REGULATORY_ANALYSIS_FAILED",
    ]);
  });

  it("persists the Brevo message ID after an outbox delivery", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ messageId: "brevo-message-1" }), { status: 201 }),
        ),
    );
    const update = vi.fn().mockResolvedValue({});
    const database = {
      emailDelivery: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          id: "delivery-1",
          invitation: null,
          templateId: 42,
          recipientEmail: "member@example.com",
          recipientName: "Member",
          parameters: { invitationUrl: "https://app.example.com/invite" },
          attempts: 1,
        }),
        update,
      },
      emailSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const processor = new EmailDeliveryProcessor();
    Object.assign(processor as unknown as { database: unknown }, { database });
    await expect(
      processor.process({
        data: { payload: { emailDeliveryId: "delivery-1" } },
      } as never),
    ).resolves.toEqual({ processed: true, messageId: "brevo-message-1" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "delivery-1" },
      data: {
        status: "SENT",
        sentAt: expect.any(Date),
        brevoMessageId: "brevo-message-1",
        lastError: null,
      },
    });
  });
});
