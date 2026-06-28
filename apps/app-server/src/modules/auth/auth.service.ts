import { Injectable, Optional } from "@nestjs/common";
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
  repository: {
    storageMode: string;
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
      repository: {
        storageMode: this.authRepository.storageMode,
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
      const profile = await this.fetchProviderProfile(provider, token);

      return {
        ok: true,
        provider: providerId,
        nextPath: stateResult.record.nextPath,
        profile,
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

  private getConfiguredProvider(providerId: AuthProviderName) {
    const provider = this.config.providers[providerId];

    if (!provider.configured) {
      throw new AuthFlowError("oauth_provider_not_configured");
    }

    return provider;
  }

  private async exchangeOAuthCode(provider: AuthProviderConfig, code: string) {
    const response = await this.fetcher(provider.tokenUrl, {
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

    return accessToken;
  }

  private async fetchProviderProfile(
    provider: AuthProviderConfig,
    accessToken: string,
  ): Promise<OAuthProviderProfile> {
    const response = await this.fetcher(provider.userInfoUrl, {
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

    return {
      provider: provider.id,
      providerAccountId,
      email: getStringField(profileResponse, "email"),
      name:
        getStringField(profileResponse, "name") ??
        getStringField(profileResponse, "login"),
      avatarUrl:
        getStringField(profileResponse, "picture") ??
        getStringField(profileResponse, "avatar_url"),
      emailVerified:
        provider.id === "google"
          ? getBooleanField(profileResponse, "email_verified")
          : null,
    };
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

function getBooleanField(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];

  return typeof field === "boolean" ? field : null;
}
