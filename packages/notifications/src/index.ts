import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { EmailType } from "@qhse/contracts";
import type { DatabaseClient, EmailSetting } from "@qhse/database";

export const EMAIL_SETTINGS_ROW_ID = "singleton";

export const emailCatalog = {
  ORGANIZATION_INVITATION: {
    label: "Organization invitation",
    settingField: "organizationInvitationTemplateId",
    requiredParameters: [
      "recipientEmail",
      "inviterName",
      "inviterEmail",
      "organizationName",
      "role",
      "invitationUrl",
      "expiresAt",
    ],
    example: {
      recipientEmail: "member@example.com",
      inviterName: "Nadia Admin",
      inviterEmail: "nadia@example.com",
      organizationName: "Atlas Industries",
      role: "member",
      invitationUrl: "https://app.example.com/accept-invitation/example",
      expiresAt: "2026-09-11T12:00:00.000Z",
    },
  },
  REGULATORY_CLARIFICATION_REQUIRED: {
    label: "Regulatory clarification required",
    settingField: "regulatoryClarificationRequiredTemplateId",
    requiredParameters: [
      "recipientName",
      "organizationName",
      "projectName",
      "actionUrl",
      "analysisId",
    ],
    example: {
      recipientName: "Nadia Admin",
      organizationName: "Atlas Industries",
      projectName: "Casablanca Plant",
      actionUrl: "https://app.example.com/projects/example/regulatory-watch",
      analysisId: "analysis-example",
    },
  },
  REGULATORY_REVIEW_READY: {
    label: "Regulatory review ready",
    settingField: "regulatoryReviewReadyTemplateId",
    requiredParameters: [
      "recipientName",
      "organizationName",
      "projectName",
      "actionUrl",
      "analysisId",
      "candidateCount",
    ],
    example: {
      recipientName: "Nadia Admin",
      organizationName: "Atlas Industries",
      projectName: "Casablanca Plant",
      actionUrl: "https://app.example.com/projects/example/regulatory-watch",
      analysisId: "analysis-example",
      candidateCount: 12,
    },
  },
  REGULATORY_IMPACT: {
    label: "Regulatory impact",
    settingField: "regulatoryImpactTemplateId",
    requiredParameters: [
      "recipientName",
      "organizationName",
      "projectName",
      "actionUrl",
      "documentReference",
      "documentTitle",
    ],
    example: {
      recipientName: "Nadia Admin",
      organizationName: "Atlas Industries",
      projectName: "Casablanca Plant",
      actionUrl: "https://app.example.com/projects/example/regulatory-watch",
      documentReference: "Law 00-00",
      documentTitle: "Example regulatory text",
    },
  },
  REGULATORY_ANALYSIS_FAILED: {
    label: "Regulatory analysis failed",
    settingField: "regulatoryAnalysisFailedTemplateId",
    requiredParameters: [
      "recipientName",
      "organizationName",
      "projectName",
      "actionUrl",
      "analysisId",
      "errorSummary",
    ],
    example: {
      recipientName: "Nadia Admin",
      organizationName: "Atlas Industries",
      projectName: "Casablanca Plant",
      actionUrl: "https://app.example.com/projects/example/regulatory-watch",
      analysisId: "analysis-example",
      errorSummary: "The analysis could not be completed.",
    },
  },
  REGULATORY_ACTION_DUE_SOON: {
    label: "Regulatory action due soon",
    settingField: "regulatoryActionDueSoonTemplateId",
    requiredParameters: [
      "recipientName",
      "organizationName",
      "projectName",
      "actionUrl",
      "actionTitle",
      "responsibleName",
      "dueDate",
      "daysRemaining",
    ],
    example: {
      recipientName: "Nadia Admin",
      organizationName: "Atlas Industries",
      projectName: "Casablanca Plant",
      actionUrl: "https://app.example.com/projects/example/regulatory-watch",
      actionTitle: "Update the safety register",
      responsibleName: "Nadia Admin",
      dueDate: "2026-09-16",
      daysRemaining: 7,
    },
  },
  REGULATORY_ACTION_OVERDUE: {
    label: "Regulatory action overdue",
    settingField: "regulatoryActionOverdueTemplateId",
    requiredParameters: [
      "recipientName",
      "organizationName",
      "projectName",
      "actionUrl",
      "actionTitle",
      "responsibleName",
      "dueDate",
      "daysOverdue",
    ],
    example: {
      recipientName: "Nadia Admin",
      organizationName: "Atlas Industries",
      projectName: "Casablanca Plant",
      actionUrl: "https://app.example.com/projects/example/regulatory-watch",
      actionTitle: "Update the safety register",
      responsibleName: "Nadia Admin",
      dueDate: "2026-09-02",
      daysOverdue: 7,
    },
  },
} as const satisfies Record<
  EmailType,
  {
    label: string;
    settingField: keyof EmailSetting;
    requiredParameters: readonly string[];
    example: Record<string, string | number>;
  }
>;

const ALGORITHM = "aes-256-gcm";

function encryptionKey(secret = process.env["BETTER_AUTH_SECRET"]): Buffer {
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to store the Brevo API key");
  return createHash("sha256").update(`qhse:email-settings:${secret}`).digest();
}

export function encryptEmailSecret(plaintext: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptEmailSecret(stored: string, secret?: string): string | null {
  try {
    const [version, iv, tag, ciphertext] = stored.split(":");
    if (version !== "v1" || !iv || !tag || !ciphertext) return null;
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(secret), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function maskEmailSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function maskEmailAddress(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
}

export function organizationInvitationUrl(appOrigin: string, invitationId: string): string {
  return `${appOrigin.replace(/\/+$/, "")}/accept-invitation/${encodeURIComponent(invitationId)}`;
}

export function organizationInvitationParameters(input: {
  recipientEmail: string;
  inviterName: string;
  inviterEmail: string;
  organizationName: string;
  role: string;
  appOrigin: string;
  invitationId: string;
  expiresAt: Date;
}) {
  return {
    recipientEmail: input.recipientEmail,
    inviterName: input.inviterName,
    inviterEmail: input.inviterEmail,
    organizationName: input.organizationName,
    role: input.role,
    invitationUrl: organizationInvitationUrl(input.appOrigin, input.invitationId),
    expiresAt: input.expiresAt.toISOString(),
  };
}

export function templateIdFor(record: EmailSetting | null, type: EmailType): number | null {
  if (!record) return null;
  const value = record[emailCatalog[type].settingField];
  return typeof value === "number" ? value : null;
}

export function resolveBrevoApiKey(record: EmailSetting | null): {
  value: string | null;
  source: "database" | "environment" | "none";
  preview: string | null;
} {
  if (record?.brevoApiKeyCiphertext) {
    const decrypted = decryptEmailSecret(record.brevoApiKeyCiphertext);
    if (decrypted)
      return { value: decrypted, source: "database", preview: record.brevoApiKeyPreview };
  }
  const environment = process.env["BREVO_API_KEY"]?.trim();
  return environment
    ? { value: environment, source: "environment", preview: maskEmailSecret(environment) }
    : { value: null, source: "none", preview: null };
}

export type BrevoTemplate = {
  id: number;
  name: string;
  subject: string;
  isActive: boolean;
};

export interface TransactionalEmailProvider {
  getTemplate(templateId: number): Promise<BrevoTemplate>;
  send(input: {
    templateId: number;
    recipient: { email: string; name?: string | null };
    parameters: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<{ messageId: string | null }>;
}

export class BrevoProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BrevoProviderError";
  }
}

export class BrevoTransactionalEmailProvider implements TransactionalEmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly apiBaseUrl = process.env["BREVO_API_BASE_URL"] ?? "https://api.brevo.com/v3",
  ) {}

  private async request(path: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": this.apiKey,
          ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new BrevoProviderError(
        error instanceof Error ? error.message : "Brevo request failed",
        true,
      );
    }
    if (!response.ok) {
      const body = await response.text();
      throw new BrevoProviderError(
        `Brevo returned ${response.status}: ${body.slice(0, 300)}`,
        response.status === 429 || response.status >= 500,
        response.status,
      );
    }
    return response;
  }

  async getTemplate(templateId: number): Promise<BrevoTemplate> {
    const response = await this.request(`/smtp/templates/${templateId}`);
    return (await response.json()) as BrevoTemplate;
  }

  async send(input: {
    templateId: number;
    recipient: { email: string; name?: string | null };
    parameters: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<{ messageId: string | null }> {
    const response = await this.request("/smtp/email", {
      method: "POST",
      headers: { "idempotency-key": input.idempotencyKey },
      body: JSON.stringify({
        templateId: input.templateId,
        to: [
          {
            email: input.recipient.email,
            ...(input.recipient.name ? { name: input.recipient.name } : {}),
          },
        ],
        params: input.parameters,
      }),
    });
    const result = (await response.json()) as { messageId?: string };
    return { messageId: result.messageId ?? null };
  }
}

export async function createEmailDelivery(
  database: DatabaseClient,
  input: {
    organizationId: string;
    invitationId?: string;
    recipientUserId?: string;
    type: EmailType;
    eventKey: string;
    recipientEmail: string;
    recipientName?: string | null;
    entityType?: string;
    entityId?: string;
    parameters: Record<string, string | number>;
  },
) {
  const settings = await database.emailSetting.findUnique({ where: { id: EMAIL_SETTINGS_ROW_ID } });
  const templateId = templateIdFor(settings, input.type);
  if (!templateId) return null;
  return database.emailDelivery.upsert({
    where: {
      eventKey_type_recipientEmail: {
        eventKey: input.eventKey,
        type: input.type,
        recipientEmail: input.recipientEmail.toLowerCase(),
      },
    },
    update: {},
    create: {
      organizationId: input.organizationId,
      invitationId: input.invitationId ?? null,
      recipientUserId: input.recipientUserId ?? null,
      type: input.type,
      eventKey: input.eventKey,
      recipientEmail: input.recipientEmail.toLowerCase(),
      recipientName: input.recipientName ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      templateId,
      parameters: input.parameters,
    },
  });
}
