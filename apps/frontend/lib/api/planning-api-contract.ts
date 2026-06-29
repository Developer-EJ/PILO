import type {
  PaginationQuery,
  ProjectPlanDraftSummaryPage,
} from "../types/public-contracts";

export interface PlanningApiContract {
  listPlanningDrafts(
    workspaceId: string,
    pagination?: PaginationQuery,
  ): Promise<ProjectPlanDraftSummaryPage>;
}
