import { Injectable, Optional } from "@nestjs/common";
import { createHmac } from "node:crypto";
import {
  type AuthConfig,
  createAuthConfig,
  normalizeAuthNextPath,
  normalizeOAuthRedirectUri,
  type AuthProviderConfig,
  type AuthProviderName,
} from "./auth.config";
import { AuthRepository } from "./auth.repository";
import type { OAuthStateValidationResult } from "./auth.state";
import type {
  AuthSessionRecord,
  OAuthIdentityRecord,
  OAuthTokenMetadata,
} from "./auth.repository";
import { createOAuthToken } from "./auth.state";

export type AuthProviderSummary = {
  id: AuthProviderConfig["id"];
  label: string;
  startPath: string;
  callbackPath: string;
  callbackUrl: string;
  scopes: string[];
  configured: boolean;
  missingEnv: string[];
  loginOnly: true;
};

export type AuthProvidersResponse = {
  providers: AuthProviderSummary[];
  session: {
    cookieName: string;
    configured: boolean;
    source: "env" | "local-fallback";
  };
};

export type BeginOAuthLoginResponse = {
  provider: AuthProviderSummary;
  state: string;
  nonce: string;
  nextPath: string;
  expiresAt: string;
};

export type OAuthAuthorizationRedirect = BeginOAuthLoginResponse & {
  redirectUrl: string;
};

export type OAuthCallbackQuery = {
  code?: string;
  state?: string;
  error?: string;
};

export type OAuthProviderProfile = {
  provider: AuthProviderName;
  providerAccountId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean | null;
};

export type OAuthCallbackResult =
  | {
      ok: true;
      provider: AuthProviderName;
      nextPath: string;
      profile: OAuthProviderProfile;
      identity: OAuthIdentityRecord;
      session: AuthSessionIssue;
    }
  | {
      ok: false;
      provider: AuthProviderName;
      errorCode: string;
    };

type AuthFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

type AuthServiceOptions = {
  config?: AuthConfig;
  fetcher?: AuthFetch;
};

type AuthSessionMetadata = {
  userAgent?: string | null;
  ipAddress?: string | null;
};

const DEFAULT_OAUTH_FETCH_TIMEOUT_MS = 10_000;

export type AuthSessionIssue = {
  record: AuthSessionRecord;
  cookieName: string;
  cookieHeader: string;
  expiresAt: string;
};

export type CurrentUserResponse = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  providers: AuthProviderName[];
  lastLoginAt: string | null;
};

export type LogoutSessionResult = {
  revoked: boolean;
  cookieHeader: string;
};

class AuthFlowError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AuthFlowError";
  }
}

@Injectable()
export class AuthService {
  private readonly config: AuthConfig;

  private readonly fetcher: AuthFetch;

  constructor(
    private readonly authRepository: AuthRepository,
    @Optional() options?: AuthServiceOptions,
  ) {
    this.config = options?.config ?? createAuthConfig();
    this.fetcher = options?.fetcher ?? fetch;
  }

  getProviders(): AuthProvidersResponse {
    return {
      providers: Object.values(this.config.providers).map((provider) => ({
        id: provider.id,
        label: provider.label,
        startPath: provider.startPath,
        callbackPath: provider.callbackPath,
        callbackUrl: provider.callbackUrl,
        scopes: provider.scopes,
        configured: provider.configured,
        missingEnv: provider.missingEnv,
        loginOnly: true,
      })),
      session: {
        cookieName: this.config.session.cookieName,
        configured: this.config.session.source === "env",
        source: this.config.session.source,
      },
    };
  }

  beginOAuthLogin(
    providerId: AuthProviderName,
    nextPath?: string,
  ): BeginOAuthLoginResponse {
    const provider = this.config.providers[providerId];
    const normalizedNextPath = normalizeAuthNextPath(nextPath);
    const stateRecord = this.authRepository.createOAuthState({
      provider: providerId,
      nextPath: normalizedNextPath,
      ttlMs: this.config.oauthStateTtlMs,
    });

    return {
      provider: this.toProviderSummary(provider),
      state: stateRecord.state,
      nonce: stateRecord.nonce,
      nextPath: stateRecord.nextPath,
      expiresAt: stateRecord.expiresAt.toISOString(),
    };
  }

  createOAuthAuthorizationRedirect(
    providerId: AuthProviderName,
    nextPath?: string,
  ): OAuthAuthorizationRedirect {
    const provider = this.getConfiguredProvider(providerId);
    const loginState = this.beginOAuthLogin(providerId, nextPath);
    const redirectUrl = new URL(provider.authorizationUrl);

    redirectUrl.searchParams.set("client_id", provider.clientId ?? "");
    redirectUrl.searchParams.set("redirect_uri", provider.callbackUrl);
    redirectUrl.searchParams.set("response_type", "code");
    redirectUrl.searchParams.set("scope", provider.scopes.join(" "));
    redirectUrl.searchParams.set("state", loginState.state);
    redirectUrl.searchParams.set("nonce", loginState.nonce);

    return {
      ...loginState,
      redirectUrl: redirectUrl.toString(),
    };
  }

  async handleOAuthCallback(
    providerId: AuthProviderName,
    query: OAuthCallbackQuery,
    sessionMetadata: AuthSessionMetadata = {},
  ): Promise<OAuthCallbackResult> {
    if (query.error) {
      return {
        ok: false,
        provider: providerId,
        errorCode: query.error,
      };
    }

    if (!query.code || !query.state) {
      return {
        ok: false,
        provider: providerId,
        errorCode: "missing_oauth_callback_params",
      };
    }

    const stateResult = this.verifyOAuthState({
      provider: providerId,
      state: query.state,
    });

    if (!stateResult.valid) {
      return {
        ok: false,
        provider: providerId,
        errorCode: `oauth_state_${stateResult.reason}`,
      };
    }

    try {
      const provider = this.getConfiguredProvider(providerId);
      const token = await this.exchangeOAuthCode(provider, query.code);
      const profile = await this.fetchProviderProfile(
        provider,
        token.accessToken,
      );
      const identity = this.authRepository.upsertOAuthIdentity({
        profile,
        token: {
          scopes: token.scopes.length > 0 ? token.scopes : provider.scopes,
          tokenType: token.tokenType,
          tokenExpiresAt: token.tokenExpiresAt,
        },
      });
      const session = this.issueAuthSession(identity.user.id, sessionMetadata);

      return {
        ok: true,
        provider: providerId,
        nextPath: stateResult.record.nextPath,
        profile,
        identity,
        session,
      };
    } catch (error) {
      return {
        ok: false,
        provider: providerId,
        errorCode:
          error instanceof AuthFlowError ? error.code : "oauth_callback_failed",
      };
    }
  }

  createLoginResultRedirect(input: {
    provider: AuthProviderName;
    status: "success" | "error";
    nextPath?: string;
    errorCode?: string;
  }) {
    const redirectUrl = new URL("/login", this.config.frontendUrl);

    redirectUrl.searchParams.set("auth", input.status);
    redirectUrl.searchParams.set("provider", input.provider);

    if (input.status === "success") {
      redirectUrl.searchParams.set(
        "next",
        normalizeAuthNextPath(input.nextPath),
      );
    }

    if (input.status === "error") {
      redirectUrl.searchParams.set(
        "error",
        input.errorCode ?? "oauth_callback_failed",
      );
    }

    return redirectUrl.toString();
  }

  getCurrentUserFromCookieHeader(
    cookieHeader?: string,
    now = new Date(),
  ): CurrentUserResponse | null {
    const rawToken = this.readSessionTokenFromCookieHeader(cookieHeader);

    if (!rawToken) {
      return null;
    }

    const identity = this.authRepository.findSessionIdentityByTokenHash(
      this.hashSessionToken(rawToken),
      now,
    );

    if (!identity) {
      return null;
    }

    return {
      id: identity.user.id,
      name: identity.user.name,
      email: identity.user.email,
      avatarUrl: identity.user.avatarUrl,
      providers: sortAuthProviders(
        identity.oauthAccounts.map((oauthAccount) => oauthAccount.provider),
      ),
      lastLoginAt: identity.user.lastLoginAt,
    };
  }

  logoutFromCookieHeader(cookieHeader?: string): LogoutSessionResult {
    const rawToken = this.readSessionTokenFromCookieHeader(cookieHeader);
    const revokedSession = rawToken
      ? this.authRepository.revokeAuthSessionByTokenHash(
          this.hashSessionToken(rawToken),
        )
      : null;

    return {
      revoked: Boolean(revokedSession),
      cookieHeader: this.createExpiredSessionCookieHeader(),
    };
  }

  verifyOAuthState(input: {
    provider: AuthProviderName;
    state: string;
    nonce?: string;
    now?: Date;
  }): OAuthStateValidationResult {
    return this.authRepository.consumeOAuthState(input);
  }

  private toProviderSummary(provider: AuthProviderConfig): AuthProviderSummary {
    return {
      id: provider.id,
      label: provider.label,
      startPath: provider.startPath,
      callbackPath: provider.callbackPath,
      callbackUrl: provider.callbackUrl,
      scopes: provider.scopes,
      configured: provider.configured,
      missingEnv: provider.missingEnv,
      loginOnly: true,
    };
  }

  private issueAuthSession(
    userId: string,
    metadata: AuthSessionMetadata,
  ): AuthSessionIssue {
    const rawToken = createOAuthToken(48);
    const expiresAt = new Date(Date.now() + this.config.session.ttlMs);
    const record = this.authRepository.createAuthSession({
      userId,
      refreshTokenHash: this.hashSessionToken(rawToken),
      tokenHashAlgorithm: this.config.session.hashAlgorithm,
      secretVersion: this.config.session.secretVersion,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      expiresAt,
    });

    return {
      record,
      cookieName: this.config.session.cookieName,
      cookieHeader: this.createSessionCookieHeader(rawToken, expiresAt),
      expiresAt: record.expiresAt,
    };
  }

  private hashSessionToken(rawToken: string) {
    return createHmac("sha256", this.config.session.secret)
      .update(rawToken)
      .digest("hex");
  }

  private createSessionCookieHeader(rawToken: string, expiresAt: Date) {
    const cookieParts = [
      `${encodeURIComponent(this.config.session.cookieName)}=${encodeURIComponent(rawToken)}`,
      "Path=/",
      "HttpOnly",
      `SameSite=${this.config.session.sameSite}`,
      `Expires=${expiresAt.toUTCString()}`,
      `Max-Age=${Math.floor(this.config.session.ttlMs / 1000)}`,
    ];

    if (this.config.session.secure) {
      cookieParts.push("Secure");
    }

    return cookieParts.join("; ");
  }

  private createExpiredSessionCookieHeader() {
    const cookieParts = [
      `${encodeURIComponent(this.config.session.cookieName)}=`,
      "Path=/",
      "HttpOnly",
      `SameSite=${this.config.session.sameSite}`,
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "Max-Age=0",
    ];

    if (this.config.session.secure) {
      cookieParts.push("Secure");
    }

    return cookieParts.join("; ");
  }

  private readSessionTokenFromCookieHeader(cookieHeader?: string) {
    if (!cookieHeader) {
      return null;
    }

    const cookiePair = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) =>
        part.startsWith(
          `${encodeURIComponent(this.config.session.cookieName)}=`,
        ),
      );

    if (!cookiePair) {
      return null;
    }

    try {
      return decodeURIComponent(cookiePair.split("=").slice(1).join("="));
    } catch {
      return null;
    }
  }

  private getConfiguredProvider(providerId: AuthProviderName) {
    const provider = this.config.providers[providerId];

    if (!provider.configured) {
      throw new AuthFlowError("oauth_provider_not_configured");
    }

    return provider;
  }

  private async exchangeOAuthCode(
    provider: AuthProviderConfig,
    code: string,
  ): Promise<OAuthTokenMetadata & { accessToken: string }> {
    const response = await this.fetchWithTimeout(provider.tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: provider.clientId ?? "",
        client_secret: provider.clientSecret ?? "",
        code,
        grant_type: "authorization_code",
        redirect_uri: normalizeOAuthRedirectUri(undefined, provider),
      }),
    });

    if (!response.ok) {
      throw new AuthFlowError("oauth_token_exchange_failed");
    }

    const tokenResponse = await response.json();
    const accessToken = getStringField(tokenResponse, "access_token");

    if (!accessToken) {
      throw new AuthFlowError("oauth_token_missing_access_token");
    }

    return {
      accessToken,
      scopes: parseScopeList(getStringField(tokenResponse, "scope")),
      tokenType: getStringField(tokenResponse, "token_type"),
      tokenExpiresAt: createTokenExpiresAt(
        getNumberField(tokenResponse, "expires_in"),
      ),
    };
  }

  private async fetchProviderProfile(
    provider: AuthProviderConfig,
    accessToken: string,
  ): Promise<OAuthProviderProfile> {
    const response = await this.fetchWithTimeout(provider.userInfoUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new AuthFlowError("oauth_profile_fetch_failed");
    }

    const profileResponse = await response.json();
    const providerAccountId = getProviderAccountId(provider, profileResponse);

    if (!providerAccountId) {
      throw new AuthFlowError("oauth_profile_missing_id");
    }

    const githubPrimaryEmail =
      provider.id === "github"
        ? await this.fetchGithubPrimaryVerifiedEmail(provider, accessToken)
        : null;

    return {
      provider: provider.id,
      providerAccountId,
      email: githubPrimaryEmail ?? getStringField(profileResponse, "email"),
      name:
        getStringField(profileResponse, "name") ??
        getStringField(profileResponse, "login"),
      avatarUrl:
        getStringField(profileResponse, "picture") ??
        getStringField(profileResponse, "avatar_url"),
      emailVerified:
        provider.id === "google"
          ? getBooleanField(profileResponse, "email_verified")
          : githubPrimaryEmail !== null,
    };
  }

  private async fetchGithubPrimaryVerifiedEmail(
    provider: AuthProviderConfig,
    accessToken: string,
  ) {
    if (!provider.emailUrl) {
      return null;
    }

    const response = await this.fetchWithTimeout(provider.emailUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new AuthFlowError("oauth_email_fetch_failed");
    }

    const emailResponse = await response.json();

    if (!Array.isArray(emailResponse)) {
      return null;
    }

    const primaryVerifiedEmail = emailResponse.find(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        getBooleanField(entry, "primary") === true &&
        getBooleanField(entry, "verified") === true,
    );

    return primaryVerifiedEmail
      ? getStringField(primaryVerifiedEmail, "email")
      : null;
  }

  private async fetchWithTimeout(input: string | URL, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      DEFAULT_OAUTH_FETCH_TIMEOUT_MS,
    );

    try {
      return await this.fetcher(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AuthFlowError("oauth_provider_timeout");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function getProviderAccountId(
  provider: AuthProviderConfig,
  profileResponse: unknown,
) {
  if (provider.id === "github") {
    return getStringOrNumberField(profileResponse, "id");
  }

  return getStringField(profileResponse, "sub");
}

function getStringField(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];

  return typeof field === "string" ? field : null;
}

function getStringOrNumberField(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];

  if (typeof field === "number" && Number.isFinite(field)) {
    return String(field);
  }

  return typeof field === "string" ? field : null;
}

function getNumberField(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];

  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function getBooleanField(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];

  return typeof field === "boolean" ? field : null;
}

function parseScopeList(scope: string | null) {
  return scope?.split(/\s+/).filter(Boolean) ?? [];
}

function createTokenExpiresAt(expiresInSeconds: number | null) {
  if (!expiresInSeconds) {
    return null;
  }

  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

function sortAuthProviders(providers: AuthProviderName[]) {
  const providerOrder: Record<AuthProviderName, number> = {
    google: 0,
    github: 1,
  };

  return Array.from(new Set(providers)).sort(
    (left, right) => providerOrder[left] - providerOrder[right],
  );
}
