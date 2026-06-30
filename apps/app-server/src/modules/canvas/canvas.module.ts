import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { CanvasController } from "./canvas.controller";
import { CanvasRepository } from "./canvas.repository";
import { CanvasService } from "./canvas.service";

@Module({
  imports: [AuthModule, DatabaseModule, WorkspaceModule],
  controllers: [CanvasController],
  providers: [CanvasRepository, CanvasService],
  exports: [CanvasService],
})
export class CanvasModule {}
