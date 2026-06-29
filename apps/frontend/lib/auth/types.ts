export type AuthProvider = "google" | "github";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  providers: AuthProvider[];
  lastLoginAt: string | null;
};

export type AuthSessionState =
  | {
      authenticated: true;
      user: CurrentUser;
    }
  | {
      authenticated: false;
      user: null;
    };

export type AuthClient = {
  getCurrentUser(): Promise<CurrentUser | null>;
  getAuthSession(): Promise<AuthSessionState>;
  logout(): Promise<void>;
};

export type AuthClientMode = "mock" | "api";

export type AuthClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  mode?: AuthClientMode;
};
