import { Controller, Get, Param, Query } from "@nestjs/common";
import { PaginationQuery } from "../../common/contracts/public-contracts";
import {
  ContractQuerySchema,
  ContractResponseSchema,
} from "../../common/validation/contract-validation.decorators";
import { GithubService } from "./github.service";

@Controller("workspaces/:workspaceId/github")
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Get("repositories")
  @ContractResponseSchema({
    schemaName: "GithubRepositorySummary",
    isArray: true,
  })
  listGithubRepositories(@Param("workspaceId") workspaceId: string) {
    return this.githubService.listGithubRepositories(workspaceId);
  }

  @Get("issues")
  @ContractQuerySchema("PaginationQuery")
  @ContractResponseSchema("GithubIssueSummaryPage")
  listGithubIssueSummaries(
    @Param("workspaceId") workspaceId: string,
    @Query() pagination: PaginationQuery,
  ) {
    return this.githubService.listGithubIssueSummaries(workspaceId, pagination);
  }

  @Get("pull-requests")
  @ContractQuerySchema("PaginationQuery")
  @ContractResponseSchema("PullRequestSummaryPage")
  listPullRequestSummaries(
    @Param("workspaceId") workspaceId: string,
    @Query() pagination: PaginationQuery,
  ) {
    return this.githubService.listPullRequestSummaries(workspaceId, pagination);
  }
}
