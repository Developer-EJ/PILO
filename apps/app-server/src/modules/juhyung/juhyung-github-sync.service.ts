import { ConflictException, Injectable } from "@nestjs/common";
import {
  WorkspaceAccessPublicService,
  WorkspaceActor,
} from "../workspace/public/workspace-access-public.service";
import {
  JuhyungGithubProviderClient,
  GithubProviderPullRequest,
  GithubProviderRepository,
} from "./juhyung-github-provider.client";
import { JuhyungPublicAdapter } from "./juhyung-public.adapter";
import {
  GithubRepositorySummary,
  PullRequestSummary,
} from "./juhyung-public.types";
import {
  ActiveGithubConnectionRecord,
  JuhyungRepository,
} from "./juhyung.repository";

export interface GithubSyncSummary {
  syncedAt: string;
  repositories: GithubRepositorySummary[];
  pullRequests: PullRequestSummary[];
}

@Injectable()
export class JuhyungGithubSyncService {
  constructor(
    private readonly repository: JuhyungRepository,
    private readonly workspaceAccess: WorkspaceAccessPublicService,
    private readonly providerClient: JuhyungGithubProviderClient,
    private readonly publicAdapter: JuhyungPublicAdapter = new JuhyungPublicAdapter(),
  ) {}

  async syncRepositories(
    workspaceId: string,
    actor?: WorkspaceActor,
  ): Promise<GithubSyncSummary> {
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);

    const connections =
      await this.repository.listActiveGithubConnectionsForWorkspace(
        workspaceId,
    );

    if (connections.length === 0) {
      throw new ConflictException(
        "Active GitHub App connection is required before repository sync",
      );
    }

    const syncedAt = new Date();
    const repositories = [];
    const pullRequests = [];

    for (const connection of connections) {
      const accessToken =
        await this.providerClient.createInstallationAccessToken(
          connection.installationId,
        );
      const providerRepositories =
        await this.providerClient.listInstallationRepositories(accessToken);

      for (const providerRepository of providerRepositories) {
        const repository = await this.syncRepository(
          workspaceId,
          connection,
          providerRepository,
          syncedAt,
        );

        repositories.push(repository);

        const providerPullRequests = await this.providerClient.listPullRequests(
          accessToken,
          providerRepository.owner,
          providerRepository.repoName,
        );

        for (const providerPullRequest of providerPullRequests) {
          pullRequests.push(
            await this.syncPullRequest(
              repository.id,
              providerPullRequest,
              syncedAt,
            ),
          );
        }
      }
    }

    return {
      syncedAt: syncedAt.toISOString(),
      repositories: repositories.map((repository) =>
        this.publicAdapter.toGithubRepositorySummary(repository),
      ),
      pullRequests: pullRequests.map((pullRequest) =>
        this.publicAdapter.toPullRequestSummary(pullRequest),
      ),
    };
  }

  private syncRepository(
    workspaceId: string,
    connection: ActiveGithubConnectionRecord,
    providerRepository: GithubProviderRepository,
    syncedAt: Date,
  ) {
    return this.repository.upsertGithubRepository({
      workspaceId,
      githubConnectionId: connection.id,
      installationId: connection.installationId,
      owner: providerRepository.owner,
      repoName: providerRepository.repoName,
      url: providerRepository.url,
      defaultBranch: providerRepository.defaultBranch,
      syncedAt,
    });
  }

  private syncPullRequest(
    repositoryId: string,
    providerPullRequest: GithubProviderPullRequest,
    syncedAt: Date,
  ) {
    return this.repository.upsertPullRequest({
      repositoryId,
      number: providerPullRequest.number,
      title: providerPullRequest.title,
      authorLogin: providerPullRequest.authorLogin,
      state: providerPullRequest.state,
      branch: providerPullRequest.branch,
      baseBranch: providerPullRequest.baseBranch,
      url: providerPullRequest.url,
      changedFilesCount: providerPullRequest.changedFilesCount,
      additions: providerPullRequest.additions,
      deletions: providerPullRequest.deletions,
      openedAt: providerPullRequest.openedAt,
      mergedAt: providerPullRequest.mergedAt,
      closedAt: providerPullRequest.closedAt,
      syncedAt,
    });
  }
}
