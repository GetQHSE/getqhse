import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { AuthModule } from "./modules/auth/auth.module.js";
import { PlatformAdminGuard } from "./modules/auth/platform-admin.guard.js";
import { HealthModule } from "./modules/health/health.module.js";
import { EmailSettingsModule } from "./modules/email-settings/email-settings.module.js";
import { LlmSettingsModule } from "./modules/llm-settings/llm-settings.module.js";
import { NormativeDocumentsModule } from "./modules/normative-documents/normative-documents.module.js";
import { NormativeEntitlementsModule } from "./modules/normative-entitlements/normative-entitlements.module.js";
import { NormativeLicensingModule } from "./modules/normative-licensing/normative-licensing.module.js";
import { NormativeProcessingModule } from "./modules/normative-processing/normative-processing.module.js";
import { NormativePublicationModule } from "./modules/normative-publication/normative-publication.module.js";
import { NormativeReviewModule } from "./modules/normative-review/normative-review.module.js";
import { NormativeSearchTestingModule } from "./modules/normative-search-testing/normative-search-testing.module.js";
import { NormativeSourcesModule } from "./modules/normative-sources/normative-sources.module.js";
import { NormativeVersionsModule } from "./modules/normative-versions/normative-versions.module.js";
import { OrganizationsModule } from "./modules/organizations/organizations.module.js";
import { PlatformUsersModule } from "./modules/platform-users/platform-users.module.js";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env["LOG_LEVEL"] ?? "info",
        redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    NormativeSourcesModule,
    NormativeDocumentsModule,
    NormativeVersionsModule,
    NormativeProcessingModule,
    NormativeReviewModule,
    NormativePublicationModule,
    NormativeLicensingModule,
    NormativeEntitlementsModule,
    NormativeSearchTestingModule,
    OrganizationsModule,
    PlatformUsersModule,
    LlmSettingsModule,
    EmailSettingsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: PlatformAdminGuard },
  ],
})
export class AppModule {}
