import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { TenantContextGuard } from "../auth/authorization/tenant-context.guard.js";
import { FilesModule } from "../files/files.module.js";
import { ProfileChatModelPort } from "./application/profile-chat-model.port.js";
import { ProjectProfilesService } from "./application/project-profiles.service.js";
import { OpenAiProfileChatAdapter } from "./infrastructure/openai-profile-chat.adapter.js";
import { ProjectProfilesController } from "./presentation/project-profiles.controller.js";

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [ProjectProfilesController],
  providers: [
    ProjectProfilesService,
    TenantContextGuard,
    { provide: ProfileChatModelPort, useClass: OpenAiProfileChatAdapter },
  ],
})
export class ProjectProfileModule {}
