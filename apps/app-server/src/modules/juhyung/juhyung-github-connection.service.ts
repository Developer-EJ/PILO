import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import {
  WorkspaceAccessPublicService,
  WorkspaceActor,
} from "../workspace/public/workspace-access-public.service";
import {
  GithubConnectionSummary,
  JuhyungGithubConnectionRepository,
} from "./juhyung-github-connection.repository";

export interface StartGithubConnectionInput {
  scopes?: string[];
}

export interface StartGithubConnectionResponse {
  state: string;
  installationUrl: string;
}

export interface CompleteGithubAppCallbackInput {
  state: string | null | undefined;
  installationId: string | null | undefined;
  githubAccountLogin?: string | null;
  scopes?: string[];
}

@Injectable()
export class JuhyungGithubConnectionService {
  constructor(
    private readonly repository: JuhyungGithubConnectionRepository,
    private readonly workspaceAccess: WorkspaceAccessPublicService,
  ) {}

  async startConnection(
    workspaceId: string,
    input: StartGithubConnectionInput = {},
    actor?: WorkspaceActor,
  ): Promise<StartGithubConnectionResponse> {
    const member = await this.workspaceAccess.requireWorkspaceMember(
      workspaceId,
      actor,
    );
    const stateNonce = this.generateStateNonce();
    const scopes = this.normalizeScopes(input.scopes);

    await this.repository.createPendingConnectionIntent({
      workspaceId,
      connectedByMemberId: member.id,
      scopes,
      stateNonce,
    });

    return {
      state: stateNonce,
      installationUrl: this.buildInstallationUrl(stateNonce),
    };
  }

  async completeAppCallback(
    input: CompleteGithubAppCallbackInput,
  ): Promise<GithubConnectionSummary> {
    const stateNonce = this.requireNonEmpty(input.state, "state");
    const installationId = this.requireNonEmpty(
      input.installationId,
      "installation_id",
    );

    return this.repository.completeConnectionIntent({
      stateNonce,
      installationId,
      githubAccountLogin: input.githubAccountLogin ?? null,
      scopes: this.normalizeScopes(input.scopes),
    });
  }

  async listConnections(
    workspaceId: string,
    actor?: WorkspaceActor,
  ): Promise<GithubConnectionSummary[]> {
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);

    return this.repository.listConnections(workspaceId);
  }

  async revokeConnection(
    workspaceId: string,
    connectionId: string,
    actor?: WorkspaceActor,
  ): Promise<GithubConnectionSummary> {
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);

    return this.repository.revokeConnection(workspaceId, connectionId);
  }

  private generateStateNonce() {
    return randomBytes(24).toString("base64url");
  }

  private buildInstallationUrl(stateNonce: string) {
    const githubAppSlug = process.env.GITHUB_APP_SLUG?.trim();

    if (!githubAppSlug) {
      throw new InternalServerErrorException(
        "GITHUB_APP_SLUG is required to start GitHub App installation",
      );
    }

    return `https://github.com/apps/${githubAppSlug}/installations/new?state=${encodeURIComponent(stateNonce)}`;
  }

  private normalizeScopes(scopes?: string[]) {
    return Array.isArray(scopes)
      ? scopes
          .map((scope) => scope.trim())
          .filter(
            (scope, index, values) => scope && values.indexOf(scope) === index,
          )
      : [];
  }

  private requireNonEmpty(value: string | null | undefined, field: string) {
    const normalizedValue = value?.trim();

    if (!normalizedValue) {
      throw new BadRequestException(`${field} is required`);
    }

    return normalizedValue;
  }
}
