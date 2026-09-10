import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { CurrentUser } from "@qhse/auth";
import type { EmailSettingsView, EmailType, UpdateEmailSettings } from "@qhse/contracts";
import { emailTypes } from "@qhse/contracts";
import type { EmailSetting } from "@qhse/database";
import {
  BrevoProviderError,
  BrevoTransactionalEmailProvider,
  EMAIL_SETTINGS_ROW_ID,
  emailCatalog,
  encryptEmailSecret,
  maskEmailSecret,
  resolveBrevoApiKey,
  templateIdFor,
} from "@qhse/notifications";

import { AuthService } from "../auth/auth.service.js";

const WRITE_ROLES = new Set(["super_admin", "platform_admin"]);

type StoredTemplateMetadata = Partial<
  Record<EmailType, { name: string; subject: string; active: boolean; validatedAt: string }>
>;

function metadataFrom(record: EmailSetting | null): StoredTemplateMetadata {
  if (!record?.templateMetadata || typeof record.templateMetadata !== "object") return {};
  return record.templateMetadata as StoredTemplateMetadata;
}

@Injectable()
export class EmailSettingsService {
  constructor(private readonly auth: AuthService) {}

  private get database() {
    return this.auth.database;
  }

  async read(): Promise<EmailSettingsView> {
    return this.toView(await this.load());
  }

  async update(actor: CurrentUser, input: UpdateEmailSettings): Promise<EmailSettingsView> {
    this.requireWrite(actor);
    const current = await this.load();
    const data: Record<string, unknown> = { updatedByUserId: actor.id };
    let candidateKey = resolveBrevoApiKey(current).value;
    const apiKeyChanged = input.apiKey !== undefined;
    if (input.apiKey !== undefined) {
      const key = input.apiKey?.trim() ?? "";
      data["brevoApiKeyCiphertext"] = key ? encryptEmailSecret(key) : null;
      data["brevoApiKeyPreview"] = key ? maskEmailSecret(key) : null;
      candidateKey = key || process.env["BREVO_API_KEY"]?.trim() || null;
    }

    const metadata = metadataFrom(current);
    if (input.templates) {
      for (const [type, templateId] of Object.entries(input.templates) as [
        EmailType,
        number | null,
      ][]) {
        data[emailCatalog[type].settingField] = templateId;
        if (templateId === null) {
          delete metadata[type];
          continue;
        }
        if (!candidateKey) throw new BadRequestException("Configure the Brevo API key first");
        if (apiKeyChanged || templateIdFor(current, type) !== templateId) {
          const template = await this.validateWithKey(candidateKey, templateId);
          metadata[type] = {
            name: template.name,
            subject: template.subject,
            active: template.isActive,
            validatedAt: new Date().toISOString(),
          };
        }
      }
      data["templateMetadata"] = metadata;
    }

    const record = await this.database.emailSetting.upsert({
      where: { id: EMAIL_SETTINGS_ROW_ID },
      create: { id: EMAIL_SETTINGS_ROW_ID, ...data },
      update: data,
      include: { updatedBy: { select: { id: true, name: true } } },
    });
    return this.toView(record);
  }

  async validate(actor: CurrentUser, type: EmailType) {
    this.requireWrite(actor);
    const record = await this.load();
    const templateId = templateIdFor(record, type);
    if (!templateId) throw new BadRequestException("This email template is not configured");
    const key = resolveBrevoApiKey(record).value;
    if (!key) throw new BadRequestException("The Brevo API key is not configured");
    const template = await this.validateWithKey(key, templateId);
    const metadata = metadataFrom(record);
    metadata[type] = {
      name: template.name,
      subject: template.subject,
      active: template.isActive,
      validatedAt: new Date().toISOString(),
    };
    await this.database.emailSetting.update({
      where: { id: EMAIL_SETTINGS_ROW_ID },
      data: { templateMetadata: metadata, updatedByUserId: actor.id },
    });
    return { ok: true, template: metadata[type] };
  }

  async sendTest(actor: CurrentUser, type: EmailType) {
    this.requireWrite(actor);
    const record = await this.load();
    const templateId = templateIdFor(record, type);
    const key = resolveBrevoApiKey(record).value;
    if (!templateId || !key)
      throw new BadRequestException("Brevo and this template must be configured");
    await this.validateWithKey(key, templateId);
    try {
      const parameters: Record<string, string | number> = { ...emailCatalog[type].example };
      if ("recipientEmail" in parameters) parameters["recipientEmail"] = actor.email;
      if ("recipientName" in parameters) parameters["recipientName"] = `[TEST] ${actor.name}`;
      if ("inviterName" in parameters) parameters["inviterName"] = `[TEST] ${actor.name}`;
      if ("inviterEmail" in parameters) parameters["inviterEmail"] = actor.email;
      if ("organizationName" in parameters)
        parameters["organizationName"] = "[TEST] GetQHSE organization";
      if ("projectName" in parameters) parameters["projectName"] = "[TEST] GetQHSE project";
      const sent = await new BrevoTransactionalEmailProvider(key).send({
        templateId,
        recipient: { email: actor.email, name: actor.name },
        parameters,
        idempotencyKey: `email-settings-test-${type}-${crypto.randomUUID()}`,
      });
      return { ok: true, messageId: sent.messageId };
    } catch (error) {
      throw this.providerException(error);
    }
  }

  private async validateWithKey(key: string, templateId: number) {
    try {
      const template = await new BrevoTransactionalEmailProvider(key).getTemplate(templateId);
      if (!template.isActive)
        throw new BadRequestException(`Brevo template ${templateId} is inactive`);
      return template;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw this.providerException(error);
    }
  }

  private providerException(error: unknown) {
    if (error instanceof BrevoProviderError) {
      return error.retryable
        ? new ServiceUnavailableException("Brevo is temporarily unavailable")
        : new BadRequestException("Brevo rejected the template or API key");
    }
    return new ServiceUnavailableException("Unable to contact Brevo");
  }

  private requireWrite(actor: CurrentUser) {
    if (!WRITE_ROLES.has(actor.platformRole))
      throw new ForbiddenException("Email settings are read-only");
  }

  private load() {
    return this.database.emailSetting.findUnique({
      where: { id: EMAIL_SETTINGS_ROW_ID },
      include: { updatedBy: { select: { id: true, name: true } } },
    });
  }

  private toView(
    record: (EmailSetting & { updatedBy?: { id: string; name: string } | null }) | null,
  ): EmailSettingsView {
    const credential = resolveBrevoApiKey(record);
    const metadata = metadataFrom(record);
    return {
      provider: "brevo",
      credential: {
        configured: Boolean(credential.value),
        source: credential.source,
        preview: credential.preview,
      },
      templates: Object.fromEntries(
        emailTypes.map((type) => [
          type,
          {
            templateId: templateIdFor(record, type),
            requiredParameters: [...emailCatalog[type].requiredParameters],
            example: { ...emailCatalog[type].example },
            metadata: metadata[type] ?? null,
          },
        ]),
      ) as unknown as EmailSettingsView["templates"],
      updatedAt: record?.updatedAt.toISOString() ?? null,
      updatedBy: record?.updatedBy ?? null,
    };
  }
}
