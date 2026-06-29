import {
  GithubIssueSummaryPage,
  GithubRepositorySummary,
  PaginationQuery,
  PullRequestSummaryPage,
} from "../../../common/contracts/public-contracts";

export interface GithubPublicContract {
  listGithubRepositories(
    workspaceId: string,
  ): Promise<GithubRepositorySummary[]>;
  listGithubIssueSummaries(
    workspaceId: string,
    pagination?: PaginationQuery,
  ): Promise<GithubIssueSummaryPage>;
  listPullRequestSummaries(
    workspaceId: string,
    pagination?: PaginationQuery,
  ): Promise<PullRequestSummaryPage>;
}
