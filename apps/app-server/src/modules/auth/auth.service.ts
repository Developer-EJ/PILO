import { Injectable } from "@nestjs/common";
import { createAuthConfig, type AuthProviderConfig } from "./auth.config";
import { AuthRepository } from "./auth.repository";

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
}
