import { Module } from "@nestjs/common";
import { CommonModule } from "../../common/common.module";
import { DatabaseModule } from "../../database/database.module";
import { CalendarModule } from "../calendar/calendar.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { WorkspaceMembershipRevocationModule } from "../workspace-membership-revocation/workspace-membership-revocation.module";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

@Module({
  imports: [
    CommonModule,
    DatabaseModule,
    CalendarModule,
    WorkspaceModule,
    WorkspaceMembershipRevocationModule
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService]
})
export class UserModule {}
