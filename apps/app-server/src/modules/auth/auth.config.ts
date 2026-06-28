export type AuthProviderName = "google" | "github";

export type AuthProviderConfig = {
  id: AuthProviderName;
  label: string;
  clientId?: string;
  clientSecret?: string;
  startPath: string;
  callbackPath: string;
  callbackUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  configured: boolean;
  missingEnv: string[];
};

export type AuthSessionConfig = {
  cookieName: string;
  secret: string;
  source: "env" | "local-fallback";
};

export type AuthConfig = {
  frontendUrl: string;
  apiBaseUrl: string;
  oauthStateTtlMs: number;
  session: AuthSessionConfig;
  providers: Record<AuthProviderName, AuthProviderConfig>;
};

type AuthEnvironment = Record<string, string | undefined>;

const LOCAL_SESSION_SECRET = "pilo-local-session-secret-change-before-release";
const DEFAULT_FRONTEND_URL = "http://localhost:3000";
const DEFAULT_API_BASE_URL = "http://localhost:4000";
const DEFAULT_AUTH_NEXT_PATH = "/";
const DEFAULT_OAUTH_STATE_TTL_SECONDS = 600;

function readEnv(env: AuthEnvironment, key: string) {
  const value = env[key]?.trim();

  return value ? value : undefined;
}

function isProductionAuthEnvironment(env: AuthEnvironment) {
  return env.NODE_ENV === "production" || env.APP_ENV === "production";
}

function requireAuthEnv(env: AuthEnvironment, keys: string[]) {
  return keys.filter((key) => !readEnv(env, key));
}

function readPositiveIntegerEnv(
  env: AuthEnvironment,
  key: string,
  fallback: number,
) {
  const value = readEnv(env, key);
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function joinUrl(baseUrl: string, path: string) {
  return `${trimTrailingSlash(baseUrl)}${path}`;
}

function isInternalPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//");
}

export function normalizeAuthNextPath(
  nextPath?: string,
  fallbackPath = DEFAULT_AUTH_NEXT_PATH,
) {
  if (!nextPath || !isInternalPath(nextPath)) {
    return fallbackPath;
  }

  return nextPath;
}

export function normalizeOAuthRedirectUri(
  redirectUri: string | undefined,
  provider: Pick<AuthProviderConfig, "callbackUrl">,
) {
  if (!redirectUri) {
    return provider.callbackUrl;
  }

  return redirectUri === provider.callbackUrl
    ? redirectUri
    : provider.callbackUrl;
}

function assertNoMissingProductionAuthEnv(
  env: AuthEnvironment,
  missingEnv: string[],
) {
  if (missingEnv.length === 0 || !isProductionAuthEnvironment(env)) {
    return;
  }

  throw new Error(`Missing required Auth env: ${missingEnv.join(", ")}`);
}

function createSessionConfig(env: AuthEnvironment): AuthSessionConfig {
  const sessionSecret = readEnv(env, "SESSION_SECRET");

  if (sessionSecret) {
    return {
      cookieName: readEnv(env, "AUTH_SESSION_COOKIE_NAME") ?? "pilo_session",
      secret: sessionSecret,
      source: "env",
    };
  }

  assertNoMissingProductionAuthEnv(env, ["SESSION_SECRET"]);

  return {
    cookieName: readEnv(env, "AUTH_SESSION_COOKIE_NAME") ?? "pilo_session",
    secret: LOCAL_SESSION_SECRET,
    source: "local-fallback",
  };
}

function createProviderConfig(
  env: AuthEnvironment,
  apiBaseUrl: string,
  provider: Omit<
    AuthProviderConfig,
    "clientId" | "clientSecret" | "configured" | "missingEnv" | "callbackUrl"
  > & {
    clientIdEnv: string;
    clientSecretEnv: string;
  },
): AuthProviderConfig {
  const missingEnv = requireAuthEnv(env, [
    provider.clientIdEnv,
    provider.clientSecretEnv,
  ]);

  assertNoMissingProductionAuthEnv(env, missingEnv);

  return {
    id: provider.id,
    label: provider.label,
    clientId: readEnv(env, provider.clientIdEnv),
    clientSecret: readEnv(env, provider.clientSecretEnv),
    startPath: provider.startPath,
    callbackPath: provider.callbackPath,
    callbackUrl: joinUrl(apiBaseUrl, provider.callbackPath),
    authorizationUrl: provider.authorizationUrl,
    tokenUrl: provider.tokenUrl,
    userInfoUrl: provider.userInfoUrl,
    scopes: provider.scopes,
    configured: missingEnv.length === 0,
    missingEnv,
  };
}

export function createAuthConfig(env: AuthEnvironment = process.env) {
  const frontendUrl = readEnv(env, "FRONTEND_URL") ?? DEFAULT_FRONTEND_URL;
  const apiBaseUrl =
    readEnv(env, "API_BASE_URL") ??
    readEnv(env, "APP_SERVER_URL") ??
    DEFAULT_API_BASE_URL;

  return {
    frontendUrl,
    apiBaseUrl,
    oauthStateTtlMs:
      readPositiveIntegerEnv(
        env,
        "OAUTH_STATE_TTL_SECONDS",
        DEFAULT_OAUTH_STATE_TTL_SECONDS,
      ) * 1000,
    session: createSessionConfig(env),
    providers: {
      google: createProviderConfig(env, apiBaseUrl, {
        id: "google",
        label: "Google",
        clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
        clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
        startPath: "/auth/google/start",
        callbackPath: "/auth/google/callback",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
        scopes: ["openid", "email", "profile"],
      }),
      github: createProviderConfig(env, apiBaseUrl, {
        id: "github",
        label: "GitHub",
        clientIdEnv: "GITHUB_LOGIN_CLIENT_ID",
        clientSecretEnv: "GITHUB_LOGIN_CLIENT_SECRET",
        startPath: "/auth/github/start",
        callbackPath: "/auth/github/callback",
        authorizationUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        userInfoUrl: "https://api.github.com/user",
        scopes: ["read:user", "user:email"],
      }),
    },
  } satisfies AuthConfig;
}
