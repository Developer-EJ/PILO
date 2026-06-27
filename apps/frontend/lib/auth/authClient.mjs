import { createMockAuthClient } from "./mockAuthClient.mjs";

const DEFAULT_AUTH_MODE = "mock";

function defaultAppServerUrl() {
  return (
    process.env.NEXT_PUBLIC_PILO_APP_SERVER_URL ??
    process.env.NEXT_PUBLIC_APP_SERVER_URL ??
    ""
  );
}

function defaultAuthMode() {
  return process.env.NEXT_PUBLIC_PILO_AUTH_MODE ?? DEFAULT_AUTH_MODE;
}

export class AuthApiError extends Error {
  constructor(message, { status, path } = {}) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
    this.path = path;
  }
}

export function buildAuthApiUrl(path, baseUrl = defaultAppServerUrl()) {
  if (!path.startsWith("/")) {
    throw new AuthApiError("Auth API path must start with /", { path });
  }

  if (!baseUrl) {
    return path;
  }

  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function readJson(response, path) {
  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    throw new AuthApiError("Auth API returned invalid JSON", {
      status: response.status,
      path,
    });
  }
}

async function requestAuthJson(path, init, { baseUrl, fetcher }) {
  const response = await fetcher(buildAuthApiUrl(path, baseUrl), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  return response;
}

export function createAuthApiClient({
  baseUrl = defaultAppServerUrl(),
  fetcher = fetch,
} = {}) {
  return {
    async getCurrentUser() {
      const path = "/auth/me";
      const response = await requestAuthJson(path, undefined, {
        baseUrl,
        fetcher,
      });

      if (response.status === 401) {
        return null;
      }

      if (!response.ok) {
        throw new AuthApiError("Failed to load current user", {
          status: response.status,
          path,
        });
      }

      return readJson(response, path);
    },

    async getAuthSession() {
      const user = await this.getCurrentUser();

      return {
        authenticated: Boolean(user),
        user,
      };
    },

    async logout() {
      const path = "/auth/logout";
      const response = await requestAuthJson(
        path,
        { method: "POST" },
        { baseUrl, fetcher },
      );

      if (!response.ok && response.status !== 401) {
        throw new AuthApiError("Failed to logout", {
          status: response.status,
          path,
        });
      }
    },
  };
}

export function createAuthClient(options = {}) {
  const mode = options.mode ?? defaultAuthMode();

  if (mode === "api") {
    return createAuthApiClient(options);
  }

  return createMockAuthClient(options.mock);
}
