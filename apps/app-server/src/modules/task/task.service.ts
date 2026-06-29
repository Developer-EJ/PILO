import { Injectable } from "@nestjs/common";
import {
  NotImplementedError,
  TaskCreateDraft,
  TaskSummary,
} from "../../common/contracts/public-contracts";
import { TaskPublicContract } from "./public/task-public.contract";

@Injectable()
export class TaskService implements TaskPublicContract {
  listTaskSummaries(workspaceId: string): Promise<TaskSummary[]> {
    void workspaceId;
    throw new NotImplementedError("TaskPublicContract.listTaskSummaries");
  }

  createTaskDraft(draft: TaskCreateDraft): Promise<TaskSummary> {
    void draft;
    throw new NotImplementedError("TaskPublicContract.createTaskDraft");
  }
}
