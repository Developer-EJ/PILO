import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { JuhyungModule } from "./modules/juhyung/juhyung.module";

@Module({
  imports: [JuhyungModule],
  controllers: [HealthController],
})
export class AppModule {}
