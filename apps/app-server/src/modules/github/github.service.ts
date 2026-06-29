import { Injectable } from "@nestjs/common";
import {
  GithubIssueSummaryPage,
  GithubRepositorySummary,
  NotImplementedError,
  PaginationQuery,
  PullRequestSummaryPage,
} from "../../common/contracts/public-contracts";
import { GithubPublicContract } from "./public/github-public.contract";

@Injectable()
export class GithubService implements GithubPublicContract {
  listGithubRepositories(
    workspaceId: string,
  ): Promise<GithubRepositorySummary[]> {
    void workspaceId;
    throw new NotImplementedError(
      "GithubPublicContract.listGithubRepositories",
    );
  }

  listGithubIssueSummaries(
    workspaceId: string,
    pagination?: PaginationQuery,
  ): Promise<GithubIssueSummaryPage> {
    void workspaceId;
    void pagination;
    throw new NotImplementedError(
      "GithubPublicContract.listGithubIssueSummaries",
    );
  }

  listPullRequestSummaries(
    workspaceId: string,
    pagination?: PaginationQuery,
  ): Promise<PullRequestSummaryPage> {
    void workspaceId;
    void pagination;
    throw new NotImplementedError(
      "GithubPublicContract.listPullRequestSummaries",
    );
  }
}
