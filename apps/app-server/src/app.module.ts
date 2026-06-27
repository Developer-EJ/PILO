import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { ReviewModule } from "./modules/review/review.module";

@Module({
  imports: [ReviewModule],
  controllers: [HealthController],
})
export class AppModule {}
