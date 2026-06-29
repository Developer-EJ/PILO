import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { TaskCreateDraftRequest } from "../../common/contracts/public-contracts";
import {
  ContractBodySchema,
  ContractResponseSchema,
} from "../../common/validation/contract-validation.decorators";
import { TaskService } from "./task.service";

@Controller("workspaces/:workspaceId/tasks")
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get("summary")
  @ContractResponseSchema({ schemaName: "TaskSummary", isArray: true })
  listTaskSummaries(@Param("workspaceId") workspaceId: string) {
    return this.taskService.listTaskSummaries(workspaceId);
  }

  @Post("drafts")
  @HttpCode(201)
  @ContractBodySchema("TaskCreateDraftRequest")
  @ContractResponseSchema("TaskSummary")
  createTaskDraft(
    @Param("workspaceId") workspaceId: string,
    @Body() draft: TaskCreateDraftRequest,
  ) {
    return this.taskService.createTaskDraft({ ...draft, workspaceId });
  }
}
