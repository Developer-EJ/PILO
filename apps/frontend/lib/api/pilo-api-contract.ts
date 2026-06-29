import type { AgentApiContract } from "./agent-api-contract";
import type { AuthApiContract } from "./auth-api-contract";
import type { CanvasApiContract } from "./canvas-api-contract";
import type { CommonSystemApiContract } from "./common-system-api-contract";
import type { GithubApiContract } from "./github-api-contract";
import type { MeetingApiContract } from "./meeting-api-contract";
import type { PlanningApiContract } from "./planning-api-contract";
import type { ProgressApiContract } from "./progress-api-contract";
import type { ReviewApiContract } from "./review-api-contract";
import type { TaskApiContract } from "./task-api-contract";
import type { WorkspaceApiContract } from "./workspace-api-contract";

export interface PiloApiContract
  extends AgentApiContract,
    AuthApiContract,
    CanvasApiContract,
    CommonSystemApiContract,
    GithubApiContract,
    MeetingApiContract,
    PlanningApiContract,
    ProgressApiContract,
    ReviewApiContract,
    TaskApiContract,
    WorkspaceApiContract {}
