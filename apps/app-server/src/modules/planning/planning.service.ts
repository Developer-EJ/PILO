import { Injectable } from "@nestjs/common";
import {
  NotImplementedError,
  PaginationQuery,
  ProjectPlanDraftSummaryPage,
} from "../../common/contracts/public-contracts";
import { PlanningPublicContract } from "./public/planning-public.contract";

@Injectable()
export class PlanningService implements PlanningPublicContract {
  listPlanningDrafts(
    workspaceId: string,
    pagination?: PaginationQuery,
  ): Promise<ProjectPlanDraftSummaryPage> {
    void workspaceId;
    void pagination;
    throw new NotImplementedError("PlanningPublicContract.listPlanningDrafts");
  }
}
