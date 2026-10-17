import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AiPromptsController } from "./ai-prompts.controller.js";
import { AiPromptsService } from "./ai-prompts.service.js";

@Module({
  imports: [AuthModule],
  controllers: [AiPromptsController],
  providers: [AiPromptsService],
})
export class AiPromptsModule {}
