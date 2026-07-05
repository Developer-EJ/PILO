import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { GithubIntegrationModule } from "./modules/github-integration/github-integration.module";
import { PrReviewModule } from "./modules/pr-review/pr-review.module";
import { DatabaseModule } from "./database/database.module";
import { UserModule } from "./modules/user/user.module";
import { WorkspaceModule } from "./modules/workspace/workspace.module";

@Module({
  imports: [
    DatabaseModule,
    UserModule,
    WorkspaceModule,
    GithubIntegrationModule,
    PrReviewModule,
    CalendarModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
