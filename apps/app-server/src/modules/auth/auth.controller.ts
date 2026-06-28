import {
  Controller,
  Get,
  Headers,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("providers")
  getProviders() {
    return this.authService.getProviders();
  }

  @Get("me")
  getMe(@Headers("cookie") cookieHeader: string | undefined) {
    const currentUser =
      this.authService.getCurrentUserFromCookieHeader(cookieHeader);

    if (!currentUser) {
      throw new UnauthorizedException();
    }

    return currentUser;
  }

  @Get("google/start")
  startGoogle(
    @Query("next") nextPath: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    try {
      const authorization = this.authService.createOAuthAuthorizationRedirect(
        "google",
        nextPath,
      );

      return reply.redirect(authorization.redirectUrl);
    } catch {
      return reply.redirect(
        this.authService.createLoginResultRedirect({
          provider: "google",
          status: "error",
          errorCode: "oauth_provider_not_configured",
        }),
      );
    }
  }

  @Get("google/callback")
  async callbackGoogle(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const result = await this.authService.handleOAuthCallback(
      "google",
      {
        code,
        state,
        error,
      },
      {
        userAgent,
        ipAddress: request.ip,
      },
    );

    if (!result.ok) {
      return reply.redirect(
        this.authService.createLoginResultRedirect({
          provider: "google",
          status: "error",
          errorCode: result.errorCode,
        }),
      );
    }

    reply.header("Set-Cookie", result.session.cookieHeader);

    return reply.redirect(
      this.authService.createLoginResultRedirect({
        provider: "google",
        status: "success",
        nextPath: result.nextPath,
      }),
    );
  }

  @Get("github/start")
  startGithub(
    @Query("next") nextPath: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    try {
      const authorization = this.authService.createOAuthAuthorizationRedirect(
        "github",
        nextPath,
      );

      return reply.redirect(authorization.redirectUrl);
    } catch {
      return reply.redirect(
        this.authService.createLoginResultRedirect({
          provider: "github",
          status: "error",
          errorCode: "oauth_provider_not_configured",
        }),
      );
    }
  }

  @Get("github/callback")
  async callbackGithub(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Headers("user-agent") userAgent: string | undefined,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const result = await this.authService.handleOAuthCallback(
      "github",
      {
        code,
        state,
        error,
      },
      {
        userAgent,
        ipAddress: request.ip,
      },
    );

    if (!result.ok) {
      return reply.redirect(
        this.authService.createLoginResultRedirect({
          provider: "github",
          status: "error",
          errorCode: result.errorCode,
        }),
      );
    }

    reply.header("Set-Cookie", result.session.cookieHeader);

    return reply.redirect(
      this.authService.createLoginResultRedirect({
        provider: "github",
        status: "success",
        nextPath: result.nextPath,
      }),
    );
  }
}
