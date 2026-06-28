export type TaskStatus =
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "blocked";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskChecklistStatus = "todo" | "done";
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
