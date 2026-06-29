import { Injectable, NotFoundException } from "@nestjs/common";
import {
  WorkspaceAccessPublicService,
  WorkspaceActor,
} from "../workspace/public/workspace-access-public.service";
import { JuhyungPublicAdapter } from "./juhyung-public.adapter";
import {
  GithubIssueSummary,
  GithubRepositorySummary,
  PullRequestSummary,
} from "./juhyung-public.types";
import { JuhyungRepository } from "./juhyung.repository";

@Injectable()
export class JuhyungGithubReadService {
  constructor(
    private readonly repository: JuhyungRepository,
    private readonly workspaceAccess: WorkspaceAccessPublicService,
    private readonly publicAdapter: JuhyungPublicAdapter = new JuhyungPublicAdapter(),
  ) {}

  async listRepositories(
    workspaceId: string,
    actor?: WorkspaceActor,
  ): Promise<GithubRepositorySummary[]> {
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);
    const repositories =
      await this.repository.listGithubRepositoriesForWorkspace(workspaceId);

    return repositories.map((repository) =>
      this.publicAdapter.toGithubRepositorySummary(repository),
    );
  }

  async listIssues(
    repositoryId: string,
    actor?: WorkspaceActor,
  ): Promise<GithubIssueSummary[]> {
    await this.requireRepositoryAccess(repositoryId, actor);
    const issues =
      await this.repository.listGithubIssuesForRepository(repositoryId);
    const issueIds = issues.map((issue) => issue.id);
    const [labels, links] = await Promise.all([
      this.repository.listGithubIssueLabelsForIssueIds(issueIds),
      this.repository.listTaskGithubIssueLinksForIssueIds(issueIds),
    ]);
    const labelsByIssueId = groupBy(labels, "issueId");
    const linkedTaskByIssueId = new Map(
      links.map((link) => [link.issueId, link.taskId]),
    );

    return issues.map((issue) =>
      this.publicAdapter.toGithubIssueSummary(issue, {
        labels: (labelsByIssueId.get(issue.id) ?? []).map(
          (label) => label.name,
        ),
        linkedTaskId: linkedTaskByIssueId.get(issue.id) ?? null,
      }),
    );
  }

  async listPullRequests(
    repositoryId: string,
    actor?: WorkspaceActor,
  ): Promise<PullRequestSummary[]> {
    await this.requireRepositoryAccess(repositoryId, actor);
    const pullRequests =
      await this.repository.listPullRequestsForRepository(repositoryId);
    const links =
      await this.repository.listTaskPullRequestLinksForPullRequestIds(
        pullRequests.map((pullRequest) => pullRequest.id),
      );
    const linksByPullRequestId = groupBy(links, "pullRequestId");

    return pullRequests.map((pullRequest) =>
      this.publicAdapter.toPullRequestSummary(pullRequest, {
        linkedTaskIds: (linksByPullRequestId.get(pullRequest.id) ?? []).map(
          (link) => link.taskId,
        ),
      }),
    );
  }

  private async requireRepositoryAccess(
    repositoryId: string,
    actor?: WorkspaceActor,
  ) {
    const repository =
      await this.repository.getGithubRepositoryById(repositoryId);

    if (!repository) {
      throw new NotFoundException("GitHub repository was not found");
    }

    await this.workspaceAccess.requireWorkspaceMember(
      repository.workspaceId,
      actor,
    );
    return repository;
  }
}

function groupBy<T extends Record<string, unknown>>(
  values: T[],
  key: keyof T,
) {
  const result = new Map<string, T[]>();

  for (const value of values) {
    const groupKey = String(value[key]);
    result.set(groupKey, [...(result.get(groupKey) ?? []), value]);
  }

  return result;
}
