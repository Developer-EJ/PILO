import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthController } from "./health.controller";
import { WorkspaceModule } from "./modules/workspace/workspace.module";

@Module({
  imports: [AuthModule, WorkspaceModule],
  controllers: [HealthController],
})
export class AppModule {}
