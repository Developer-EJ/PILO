const DEFAULT_WORKSPACE_MODE = "mock";

export const LOCAL_MVP_USER_ID = "11111111-1111-4111-8111-111111111111";
export const LOCAL_MVP_MEMBER_ID = "33333333-3333-4333-8333-333333333331";

export const mockWorkspaces = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "PILO MVP",
    description: "AI-powered project collaboration workspace",
    type: "side_project",
    status: "active",
    myRole: "owner",
    memberCount: 5,
    createdAt: "2026-06-20T00:00:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "FILO",
    description: "Focused idea linking workspace",
    type: "side_project",
    status: "active",
    myRole: "member",
    memberCount: 3,
    createdAt: "2026-06-24T00:00:00.000Z",
  },
];

function defaultWorkspaceMode() {
  return process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ?? DEFAULT_WORKSPACE_MODE;
}

export function defaultWorkspaceApiBaseUrl() {
  return process.env.NEXT_PUBLIC_PILO_APP_SERVER_URL ?? "";
}

export function isLocalMvpActorEnabled(
  mode = process.env.NEXT_PUBLIC_PILO_LOCAL_ACTOR_MODE,
) {
  if (mode === "enabled" || mode === "true") {
    return true;
  }

  if (mode === "disabled" || mode === "false") {
    return false;
  }

  return process.env.NODE_ENV !== "production";
}

export function localMvpActorHeaders({
  userId = process.env.NEXT_PUBLIC_PILO_USER_ID ?? LOCAL_MVP_USER_ID,
  memberId = process.env.NEXT_PUBLIC_PILO_MEMBER_ID ?? LOCAL_MVP_MEMBER_ID,
} = {}) {
  if (!isLocalMvpActorEnabled()) {
    return {};
  }

  return {
    ...(userId ? { "x-user-id": userId } : {}),
    ...(memberId ? { "x-member-id": memberId } : {}),
  };
}

export function resolveWorkspaceClientMode(mode = defaultWorkspaceMode()) {
  return mode === "api" ? "api" : "mock";
}

export class WorkspaceApiError extends Error {
  constructor(message, { status, path } = {}) {
    super(message);
    this.name = "WorkspaceApiError";
    this.status = status;
    this.path = path;
  }
}

export function buildWorkspaceApiUrl(
  path,
  baseUrl = defaultWorkspaceApiBaseUrl(),
) {
  if (!path.startsWith("/")) {
    throw new WorkspaceApiError("Workspace API path must start with /", {
      path,
    });
  }

  if (!baseUrl) {
    return path;
  }

  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function readWorkspaceJson(response, path) {
  try {
    return await response.json();
  } catch (error) {
    throw new WorkspaceApiError("Workspace API returned invalid JSON", {
      status: response.status,
      path,
    });
  }
}

async function requestWorkspaceJson(path, init, { baseUrl, fetcher }) {
  return fetcher(buildWorkspaceApiUrl(path, baseUrl), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...localMvpActorHeaders(),
      ...(init?.headers ?? {}),
    },
  });
}

function withWorkspaceJsonBody(body, init = {}) {
  return {
    ...init,
    body: JSON.stringify(body),
  };
}

function normalizeWorkspaceCreateInput(input = {}) {
  return {
    name:
      typeof input.name === "string" && input.name.trim()
        ? input.name.trim()
        : "Untitled project",
    description:
      typeof input.description === "string" && input.description.trim()
        ? input.description.trim()
        : null,
    type:
      typeof input.type === "string" && input.type.trim()
        ? input.type.trim()
        : "side_project",
  };
}

export function createWorkspaceApiClient({
  baseUrl = defaultWorkspaceApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  return {
    async listWorkspaces() {
      const path = "/api/workspaces";
      const response = await requestWorkspaceJson(path, undefined, {
        baseUrl,
        fetcher,
      });

      if (!response.ok) {
        throw new WorkspaceApiError("Failed to load workspaces", {
          status: response.status,
          path,
        });
      }

      return readWorkspaceJson(response, path);
    },

    async createWorkspace(input = {}) {
      const path = "/api/workspaces";
      const response = await requestWorkspaceJson(
        path,
        withWorkspaceJsonBody(normalizeWorkspaceCreateInput(input), {
          method: "POST",
        }),
        {
          baseUrl,
          fetcher,
        },
      );

      if (!response.ok) {
        throw new WorkspaceApiError("Failed to create workspace", {
          status: response.status,
          path,
        });
      }

      return readWorkspaceJson(response, path);
    },
  };
}

export function createMockWorkspaceClient({
  workspaces = mockWorkspaces,
} = {}) {
  const localWorkspaces = [...workspaces];

  return {
    async listWorkspaces() {
      return localWorkspaces;
    },

    async createWorkspace(input = {}) {
      const body = normalizeWorkspaceCreateInput(input);
      const now = new Date().toISOString();
      const workspace = {
        id: `local-workspace-${String(localWorkspaces.length + 1).padStart(4, "0")}`,
        name: body.name,
        description: body.description,
        type: body.type,
        status: "active",
        myRole: "owner",
        memberCount: 1,
        createdAt: now,
      };

      localWorkspaces.unshift(workspace);

      return workspace;
    },
  };
}

export function createWorkspaceClient(options = {}) {
  const mode = resolveWorkspaceClientMode(options.mode);

  if (mode === "api") {
    return createWorkspaceApiClient(options);
  }

  return createMockWorkspaceClient(options.mock);
}
