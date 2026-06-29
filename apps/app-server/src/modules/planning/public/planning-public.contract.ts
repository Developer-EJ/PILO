import {
  PaginationQuery,
  ProjectPlanDraftSummaryPage,
} from "../../../common/contracts/public-contracts";

export interface PlanningPublicContract {
  listPlanningDrafts(
    workspaceId: string,
    pagination?: PaginationQuery,
  ): Promise<ProjectPlanDraftSummaryPage>;
}
