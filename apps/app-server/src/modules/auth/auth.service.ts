import { Injectable } from "@nestjs/common";
import {
  createAuthConfig,
  normalizeAuthNextPath,
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

@Injectable()
export class AuthService {
  private readonly config = createAuthConfig();

  constructor(private readonly authRepository: AuthRepository) {}

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
}
