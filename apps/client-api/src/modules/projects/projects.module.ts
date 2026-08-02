import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { ProjectsService } from "./application/projects.service.js";
import { ProjectRepository } from "./domain/project.repository.js";
import { PrismaProjectRepository } from "./infrastructure/prisma-project.repository.js";
import { ProjectsController } from "./presentation/projects.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    TenantContextGuard,
    { provide: ProjectRepository, useClass: PrismaProjectRepository },
  ],
  exports: [ProjectRepository],
})
export class ProjectsModule {}
