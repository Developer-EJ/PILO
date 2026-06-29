import type {
  TaskCreateDraftRequest,
  TaskSummary,
} from "../types/public-contracts";

export interface TaskApiContract {
  listTaskSummaries(workspaceId: string): Promise<TaskSummary[]>;
  createTaskDraft(
    workspaceId: string,
    draft: TaskCreateDraftRequest,
  ): Promise<TaskSummary>;
}
