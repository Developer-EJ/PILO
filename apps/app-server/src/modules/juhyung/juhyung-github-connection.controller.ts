import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { WorkspaceActor } from "../workspace/public/workspace-access-public.service";
import {
  CompleteGithubAppCallbackInput,
  JuhyungGithubConnectionService,
  StartGithubConnectionInput,
} from "./juhyung-github-connection.service";

type HeaderValue = string | string[] | undefined;

interface AuthenticatedRequestContext {
  auth?: {
    actor?: WorkspaceActor;
  };
}

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
    @Req() request: AuthenticatedRequestContext = {},
    @Headers("x-user-id") userId?: HeaderValue,
    @Headers("x-member-id") memberId?: HeaderValue,
  ) {
    return this.githubConnectionService.startConnection(
      workspaceId,
      body,
      this.actorFromRequest(request, userId, memberId),
    );
  }

  @Get()
  listConnections(
    @Param("workspaceId") workspaceId: string,
    @Req() request: AuthenticatedRequestContext = {},
    @Headers("x-user-id") userId?: HeaderValue,
    @Headers("x-member-id") memberId?: HeaderValue,
  ) {
    return this.githubConnectionService.listConnections(
      workspaceId,
      this.actorFromRequest(request, userId, memberId),
    );
  }

  @Delete(":connectionId")
  revokeConnection(
    @Param("workspaceId") workspaceId: string,
    @Param("connectionId") connectionId: string,
    @Req() request: AuthenticatedRequestContext = {},
    @Headers("x-user-id") userId?: HeaderValue,
    @Headers("x-member-id") memberId?: HeaderValue,
  ) {
    return this.githubConnectionService.revokeConnection(
      workspaceId,
      connectionId,
      this.actorFromRequest(request, userId, memberId),
    );
  }

  private actorFromRequest(
    request: AuthenticatedRequestContext,
    userId?: HeaderValue,
    memberId?: HeaderValue,
  ): WorkspaceActor | undefined {
    const requestActor = request.auth?.actor;

    if (requestActor?.userId || requestActor?.memberId) {
      return requestActor;
    }

    const resolvedUserId = this.firstValue(userId);
    const resolvedMemberId = this.firstValue(memberId);

    if (!resolvedUserId && !resolvedMemberId) {
      return undefined;
    }

    return {
      ...(resolvedUserId ? { userId: resolvedUserId } : {}),
      ...(resolvedMemberId ? { memberId: resolvedMemberId } : {}),
    };
  }

  private firstValue(value: HeaderValue) {
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
