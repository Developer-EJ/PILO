import { Injectable } from "@nestjs/common";
import {
  NotImplementedError,
  ProgressSummary,
} from "../../common/contracts/public-contracts";
import { ProgressPublicContract } from "./public/progress-public.contract";

@Injectable()
export class ProgressService implements ProgressPublicContract {
  getProgressSummary(workspaceId: string): Promise<ProgressSummary> {
    void workspaceId;
    throw new NotImplementedError("ProgressPublicContract.getProgressSummary");
  }
}
