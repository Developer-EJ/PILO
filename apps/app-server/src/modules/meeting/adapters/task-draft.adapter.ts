export const TASK_DRAFT_CLIENT = Symbol("TASK_DRAFT_CLIENT");

export type TaskDraftPriority = "low" | "medium" | "high" | "urgent";

export interface TaskCreateDraftPayload {
  workspaceId: string;
  sourceType: "meeting_action_item";
  sourceId: string;
  title: string;
  description: string | null;
  assigneeMemberId: string | null;
  priority: TaskDraftPriority;
  dueDate: string | null;
}

export interface TaskDraftResponse {
  taskId: string;
  payload: TaskCreateDraftPayload;
  mode: "mock";
}

export interface TaskDraftClient {
  createTaskDraft(payload: TaskCreateDraftPayload): TaskDraftResponse;
}
