import {
  TaskCreateDraft,
  TaskSummary,
} from "../../../common/contracts/public-contracts";

export interface TaskPublicContract {
  listTaskSummaries(workspaceId: string): Promise<TaskSummary[]>;
  createTaskDraft(draft: TaskCreateDraft): Promise<TaskSummary>;
}
