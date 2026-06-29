export type TaskStatus =
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "blocked";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskChecklistStatus = "todo" | "done";
export type MilestoneStatus = "planned" | "in_progress" | "done";
export type TaskDraftStatus = "draft" | "approved" | "rejected";
export type GithubIssueState = "open" | "closed";
export type PullRequestState =
  | "open"
  | "review_requested"
  | "changes_requested"
  | "merged"
  | "closed";

export interface MemberRef {
  memberId: string;
  userId?: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

export interface WorkspaceMemberRecord {
  id: string;
  userId?: string | null;
  displayName?: string | null;
}

export interface TaskRecord {
  id: string;
  workspaceId: string;
  milestoneId?: string | null;
  title: string;
  status: string;
  priority: string;
  assigneeMemberId?: string | null;
  dueDate?: Date | string | null;
  updatedAt: Date | string;
}

export interface TaskSummary {
  id: string;
  workspaceId: string;
  milestoneId: string | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: MemberRef | null;
  dueDate: string | null;
  isDelayed: boolean;
  linkedIssueCount: number;
  linkedPrCount: number;
  updatedAt: string;
}

export interface TaskDraftRecord {
  id: string;
  workspaceId: string;
  sourceType?: string | null;
  sourceId?: string | null;
  title: string;
  description?: string | null;
  assigneeMemberId?: string | null;
  priority: string;
  dueDate?: Date | string | null;
  status: string;
  taskId?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TaskDraftSummary {
  id: string;
  workspaceId: string;
  sourceType: string | null;
  sourceId: string | null;
  title: string;
  description: string | null;
  assigneeMemberId: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  status: TaskDraftStatus;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneRecord {
  id: string;
  workspaceId: string;
  title: string;
  status: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  updatedAt: Date | string;
}

export interface MilestoneSummary {
  id: string;
  workspaceId: string;
  title: string;
  status: MilestoneStatus;
  startDate: string | null;
  endDate: string | null;
  updatedAt: string;
}

export interface TaskChecklistItemRecord {
  id: string;
  taskId: string;
  title: string;
  status: string;
  sortOrder: number;
  updatedAt: Date | string;
}

export interface TaskChecklistItemSummary {
  id: string;
  taskId: string;
  title: string;
  status: TaskChecklistStatus;
  sortOrder: number;
  updatedAt: string;
}

export interface TaskDetail extends TaskSummary {
  checklistItems: TaskChecklistItemSummary[];
}

export interface TaskDependencyRecord {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: Date | string;
}

export interface TaskDependencySummary {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: string;
}

export interface TaskCommentRecord {
  id: string;
  taskId: string;
  authorMemberId?: string | null;
  body: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TaskCommentSummary {
  id: string;
  taskId: string;
  body: string;
  author: MemberRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskActivityLogRecord {
  id: string;
  taskId: string;
  actorMemberId?: string | null;
  action: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  createdAt: Date | string;
}

export interface TaskActivityLogSummary {
  id: string;
  taskId: string;
  action: string;
  actor: MemberRef | null;
  beforeValue: unknown;
  afterValue: unknown;
  createdAt: string;
}

export interface GithubIssueRecord {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  state: string;
  url: string;
  syncedAt?: Date | string | null;
}

export interface GithubIssueSummary {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  state: GithubIssueState;
  url: string;
  labels: string[];
  linkedTaskId: string | null;
  syncedAt: string | null;
}

export interface PullRequestRecord {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  authorLogin?: string | null;
  state: string;
  branch?: string | null;
  baseBranch?: string | null;
  url: string;
  changedFilesCount?: number | null;
  additions?: number | null;
  deletions?: number | null;
  syncedAt?: Date | string | null;
}

export interface PullRequestSummary {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  authorLogin: string | null;
  state: PullRequestState;
  branch: string | null;
  baseBranch: string | null;
  url: string;
  changedFilesCount: number;
  additions: number;
  deletions: number;
  linkedTaskIds: string[];
  syncedAt: string | null;
}

export interface ProgressRecord {
  workspaceId: string;
  milestoneId?: string | null;
  totalTasks: number;
  doneTasks: number;
  blockedTasks: number;
  reviewTasks: number;
  delayedTasks: number;
  progressRate: number | string | { toNumber(): number };
  capturedAt: Date | string;
}

export interface ProgressSummary {
  workspaceId: string;
  milestoneId: string | null;
  totalTasks: number;
  doneTasks: number;
  blockedTasks: number;
  reviewTasks: number;
  delayedTasks: number;
  progressRate: number;
  capturedAt: string;
}
