import type {
  GithubIssueSummary,
  GithubIssueSummaryPage,
  GithubRepositorySummary,
  PaginationQuery,
  PullRequestSummary,
  PullRequestSummaryPage,
} from "../types/public-contracts";

export interface GithubApiContract {
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
