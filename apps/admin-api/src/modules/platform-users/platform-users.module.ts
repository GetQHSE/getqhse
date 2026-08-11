import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PlatformUsersController } from "./platform-users.controller.js";
import { PlatformUsersService } from "./platform-users.service.js";

@Module({
  imports: [AuthModule],
  controllers: [PlatformUsersController],
  providers: [PlatformUsersService],
})
export class PlatformUsersModule {}
