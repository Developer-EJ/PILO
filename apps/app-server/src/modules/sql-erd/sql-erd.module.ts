import { Module } from "@nestjs/common";
import { CommonModule } from "../../common/common.module";
import { DatabaseModule } from "../../database/database.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { SqlErdSessionController } from "./sql-erd.controller";
import { SqlErdService } from "./sql-erd.service";
import { SqlErdOperationPublisherService } from "./sql-erd-operation-publisher.service";

@Module({
  imports: [CommonModule, DatabaseModule, WorkspaceModule],
  controllers: [SqlErdSessionController],
  providers: [SqlErdOperationPublisherService, SqlErdService],
  exports: [SqlErdService]
})
export class SqlErdModule {}
