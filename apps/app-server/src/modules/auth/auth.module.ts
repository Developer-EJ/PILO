import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { WorkspacePermissionController } from "./workspace-permission.controller";

@Module({
  controllers: [AuthController, WorkspacePermissionController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
