import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AgentModule } from "./modules/agent/agent.module";
import { JuhyungModule } from "./modules/juhyung/juhyung.module";

@Module({
  imports: [AgentModule, JuhyungModule],
  controllers: [HealthController],
})
export class AppModule {}
