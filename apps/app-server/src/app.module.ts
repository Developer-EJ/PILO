import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { CanvasModule } from "./modules/canvas/canvas.module";
import { HealthController } from "./health.controller";
import { WorkspaceModule } from "./modules/workspace/workspace.module";

@Module({
  imports: [AuthModule, WorkspaceModule, CanvasModule],
  controllers: [HealthController],
})
export class AppModule {}
