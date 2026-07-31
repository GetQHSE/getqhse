import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { SitesService } from "./application/sites.service.js";
import { SiteRepository } from "./domain/site.repository.js";
import { PrismaSiteRepository } from "./infrastructure/prisma-site.repository.js";
import { SitesController } from "./presentation/sites.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [SitesController],
  providers: [
    SitesService,
    TenantContextGuard,
    { provide: SiteRepository, useClass: PrismaSiteRepository },
  ],
})
export class SitesModule {}
