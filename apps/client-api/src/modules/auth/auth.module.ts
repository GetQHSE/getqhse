import { Module } from "@nestjs/common";

import { AuthenticationPort } from "./application/auth.port.js";
import { UserPreferencesService } from "./application/user-preferences.service.js";
import { BetterAuthAdapter } from "./infrastructure/better-auth.adapter.js";
import { AuthContextController } from "./presentation/auth-context.controller.js";
import { BetterAuthController } from "./presentation/better-auth.controller.js";

@Module({
  controllers: [BetterAuthController, AuthContextController],
  providers: [
    BetterAuthAdapter,
    { provide: AuthenticationPort, useExisting: BetterAuthAdapter },
    UserPreferencesService,
  ],
  exports: [AuthenticationPort],
})
export class AuthModule {}
