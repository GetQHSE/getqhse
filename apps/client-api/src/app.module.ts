import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { RequestIdMiddleware } from "./common/request-id.middleware.js";
import { AiModule } from "./modules/ai/ai.module.js";
import { AuditsModule } from "./modules/audits/audits.module.js";
import { AuditTrailModule } from "./modules/audit-trail/audit-trail.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { CorrectiveActionsModule } from "./modules/corrective-actions/corrective-actions.module.js";
import { EvidenceModule } from "./modules/evidence/evidence.module.js";
import { FilesModule } from "./modules/files/files.module.js";
import { FindingsModule } from "./modules/findings/findings.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { NormativeRepositoryModule } from "./modules/normative-repository/normative-repository.module.js";
import { OrganizationsModule } from "./modules/organizations/organizations.module.js";
import { OnboardingModule } from "./modules/onboarding/onboarding.module.js";
import { ProjectsModule } from "./modules/projects/projects.module.js";
import { SitesModule } from "./modules/sites/sites.module.js";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env["LOG_LEVEL"] ?? "info",
        redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
        customProps: (request) => ({ requestId: request.id }),
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    OrganizationsModule,
    OnboardingModule,
    ProjectsModule,
    SitesModule,
    NormativeRepositoryModule,
    AuditsModule,
    EvidenceModule,
    FindingsModule,
    CorrectiveActionsModule,
    FilesModule,
    AiModule,
    AuditTrailModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
