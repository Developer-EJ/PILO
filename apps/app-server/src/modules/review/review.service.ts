import { Injectable } from "@nestjs/common";
import {
  NotImplementedError,
  PRAnalysisSummary,
} from "../../common/contracts/public-contracts";
import { ReviewPublicContract } from "./public/review-public.contract";

@Injectable()
export class ReviewService implements ReviewPublicContract {
  listPrAnalysisSummaries(workspaceId: string): Promise<PRAnalysisSummary[]> {
    void workspaceId;
    throw new NotImplementedError(
      "ReviewPublicContract.listPrAnalysisSummaries",
    );
  }
}
