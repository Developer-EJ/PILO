import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { WorkspaceActor } from "../workspace/public/workspace-access-public.service";
import {
  CompleteGithubAppCallbackInput,
  JuhyungGithubConnectionService,
  StartGithubConnectionInput,
} from "./juhyung-github-connection.service";

type HeaderValue = string | string[] | undefined;
type RequestHeaders = Record<string, HeaderValue>;

interface GithubAppCallbackQuery {
  state?: HeaderValue;
  installation_id?: HeaderValue;
  installationId?: HeaderValue;
  account_login?: HeaderValue;
  github_account_login?: HeaderValue;
  scopes?: HeaderValue;
}

@Controller("workspaces/:workspaceId/github/connections")
export class JuhyungGithubConnectionController {
  constructor(
    private readonly githubConnectionService: JuhyungGithubConnectionService,
  ) {}

  @Post()
  startConnection(
    @Param("workspaceId") workspaceId: string,
    @Body() body: StartGithubConnectionInput = {},
    @Headers() headers: RequestHeaders = {},
  ) {
    return this.githubConnectionService.startConnection(
      workspaceId,
      body,
      this.actorFromHeaders(headers),
    );
  }

  @Get()
  listConnections(
    @Param("workspaceId") workspaceId: string,
    @Headers() headers: RequestHeaders = {},
  ) {
    return this.githubConnectionService.listConnections(
      workspaceId,
      this.actorFromHeaders(headers),
    );
  }

  @Delete(":connectionId")
  revokeConnection(
    @Param("workspaceId") workspaceId: string,
    @Param("connectionId") connectionId: string,
    @Headers() headers: RequestHeaders = {},
  ) {
    return this.githubConnectionService.revokeConnection(
      workspaceId,
      connectionId,
      this.actorFromHeaders(headers),
    );
  }

  private actorFromHeaders(headers: RequestHeaders): WorkspaceActor {
    return {
      userId: this.firstHeader(headers["x-user-id"]),
      memberId: this.firstHeader(headers["x-member-id"]),
    };
  }

  private firstHeader(value: HeaderValue) {
    return Array.isArray(value) ? value[0] : value;
  }
}

@Controller("github/app")
export class JuhyungGithubAppCallbackController {
  constructor(
    private readonly githubConnectionService: JuhyungGithubConnectionService,
  ) {}

  @Get("callback")
  completeAppCallback(@Query() query: GithubAppCallbackQuery) {
    return this.githubConnectionService.completeAppCallback({
      state: this.firstValue(query.state),
      installationId:
        this.firstValue(query.installation_id) ??
        this.firstValue(query.installationId),
      githubAccountLogin:
        this.firstValue(query.account_login) ??
        this.firstValue(query.github_account_login) ??
        null,
      scopes: this.parseScopes(query.scopes),
    } satisfies CompleteGithubAppCallbackInput);
  }

  private firstValue(value: HeaderValue) {
    return Array.isArray(value) ? value[0] : value;
  }

  private parseScopes(value: HeaderValue) {
    const scopes = this.firstValue(value);

    return scopes
      ? scopes
          .split(",")
          .map((scope) => scope.trim())
          .filter(Boolean)
      : [];
  }
}
