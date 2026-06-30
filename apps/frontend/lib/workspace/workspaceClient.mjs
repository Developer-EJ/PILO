import {
  buildPiloApiUrl,
  defaultAppServerUrl,
} from "../api/apiUrl.mjs";
import { DEFAULT_WORKSPACE_ID } from "./currentWorkspace.mjs";

const DEFAULT_WORKSPACE_MODE = "mock";
const MOCK_WORKSPACE_STORAGE_KEY = "pilo.mock.workspaces";
const MOCK_INVITE_STORAGE_KEY = "pilo.mock.workspaceInvites";

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

function defaultWorkspaceStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    return null;
  }
}

export function defaultWorkspaceApiBaseUrl() {
  return defaultAppServerUrl();
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

  return buildPiloApiUrl(path, baseUrl);
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
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
}

function withJsonBody(body, init = {}) {
  return {
    ...init,
    body: JSON.stringify(body),
  };
}

function readStoredJson(key, fallback, storage = defaultWorkspaceStorage()) {
  try {
    const rawValue = storage?.getItem(key);

    return rawValue ? JSON.parse(rawValue) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeStoredJson(key, value, storage = defaultWorkspaceStorage()) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch (error) {
    return false;
  }

  return true;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringField(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeWorkspaceOnboarding(value = {}) {
  const source = isRecord(value) ? value : {};
  const onboarding = {
    title:
      normalizeStringField(source.title) ??
      normalizeStringField(source.workspaceTitle),
    goal: normalizeStringField(source.goal),
    problem: normalizeStringField(source.problem),
    targetUsers:
      normalizeStringField(source.targetUsers) ??
      normalizeStringField(source.targetUser),
    duration: normalizeStringField(source.duration),
    teamSize:
      normalizeStringField(source.teamSize) ??
      (typeof source.teamSize === "number" && Number.isFinite(source.teamSize)
        ? String(source.teamSize)
        : null),
    experienceLevel: normalizeStringField(source.experienceLevel),
    finalDeliverable:
      normalizeStringField(source.finalDeliverable) ??
      normalizeStringField(source.outputGoal),
  };

  return Object.values(onboarding).some(Boolean) ? onboarding : null;
}

function normalizeWorkspaceCreateBody(body = {}) {
  return {
    name: normalizeStringField(body.name) ?? "Untitled workspace",
    description: normalizeStringField(body.description),
    type: normalizeStringField(body.type) ?? "side_project",
    onboarding: normalizeWorkspaceOnboarding(body.onboarding),
  };
}

function createMockWorkspace(body = {}) {
  const normalizedBody = normalizeWorkspaceCreateBody(body);
  const now = new Date().toISOString();

  return {
    id: normalizeStringField(body.id) ?? DEFAULT_WORKSPACE_ID,
    name: normalizedBody.name,
    description: normalizedBody.description ?? "Local MVP workspace",
    type: normalizedBody.type,
    status: "active",
    myRole: "owner",
    memberCount: 1,
    createdAt: now,
    onboarding: normalizedBody.onboarding,
  };
}

function readMockExtraWorkspaces() {
  const workspaces = readStoredJson(MOCK_WORKSPACE_STORAGE_KEY, []);

  return Array.isArray(workspaces) ? workspaces.filter(isRecord) : [];
}

export function listMockStoredWorkspaces() {
  return readMockExtraWorkspaces();
}

function writeMockExtraWorkspaces(workspaces) {
  writeStoredJson(MOCK_WORKSPACE_STORAGE_KEY, workspaces);
}

function mergeMockWorkspaces(baseWorkspaces, extraWorkspaces) {
  const seenWorkspaceIds = new Set();

  return [...extraWorkspaces, ...baseWorkspaces].filter((workspace) => {
    if (!workspace?.id || seenWorkspaceIds.has(workspace.id)) {
      return false;
    }

    seenWorkspaceIds.add(workspace.id);
    return true;
  });
}

function readMockInvites() {
  const invites = readStoredJson(MOCK_INVITE_STORAGE_KEY, []);

  return Array.isArray(invites) ? invites.filter(isRecord) : [];
}

function writeMockInvites(invites) {
  writeStoredJson(MOCK_INVITE_STORAGE_KEY, invites);
}

function createMockMember(workspaceId, workspace) {
  return {
    memberId: `local-member-${workspaceId}`,
    userId: "11111111-1111-4111-8111-111111111111",
    name: "동현",
    email: "donghyun@example.com",
    avatarUrl: null,
    role: workspace?.myRole ?? "owner",
    displayName: "Workspace / Canvas",
    joinedAt: workspace?.createdAt ?? new Date().toISOString(),
  };
}

async function expectWorkspaceResponse(response, path, message) {
  if (!response.ok) {
    throw new WorkspaceApiError(message, {
      status: response.status,
      path,
    });
  }

  return readWorkspaceJson(response, path);
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

    async getWorkspace(workspaceId) {
      const path = `/api/workspaces/${encodeURIComponent(workspaceId)}`;
      const response = await requestWorkspaceJson(path, undefined, {
        baseUrl,
        fetcher,
      });

      return expectWorkspaceResponse(
        response,
        path,
        "Failed to load workspace",
      );
    },

    async createWorkspace(body) {
      const path = "/api/workspaces";
      const response = await requestWorkspaceJson(
        path,
        withJsonBody(body, { method: "POST" }),
        { baseUrl, fetcher },
      );

      return expectWorkspaceResponse(
        response,
        path,
        "Failed to create workspace",
      );
    },

    async listWorkspaceMembers(workspaceId) {
      const path = `/api/workspaces/${encodeURIComponent(workspaceId)}/members`;
      const response = await requestWorkspaceJson(path, undefined, {
        baseUrl,
        fetcher,
      });

      return expectWorkspaceResponse(
        response,
        path,
        "Failed to load workspace members",
      );
    },

    async createWorkspaceInvite(workspaceId, body) {
      const path = `/api/workspaces/${encodeURIComponent(workspaceId)}/invites`;
      const response = await requestWorkspaceJson(
        path,
        withJsonBody(body, { method: "POST" }),
        { baseUrl, fetcher },
      );

      return expectWorkspaceResponse(
        response,
        path,
        "Failed to create workspace invite",
      );
    },

    async acceptWorkspaceInvite(inviteId, body) {
      const path = `/api/workspace-invites/${encodeURIComponent(inviteId)}/accept`;
      const response = await requestWorkspaceJson(
        path,
        withJsonBody(body, { method: "POST" }),
        { baseUrl, fetcher },
      );

      return expectWorkspaceResponse(
        response,
        path,
        "Failed to accept workspace invite",
      );
    },
  };
}

export function createMockWorkspaceClient({
  workspaces = mockWorkspaces,
} = {}) {
  return {
    async listWorkspaces() {
      return mergeMockWorkspaces(workspaces, readMockExtraWorkspaces());
    },

    async getWorkspace(workspaceId) {
      const workspace = (await this.listWorkspaces()).find(
        (candidate) => candidate.id === workspaceId,
      );

      if (!workspace) {
        throw new WorkspaceApiError("Failed to load workspace", {
          status: 404,
          path: `/api/workspaces/${workspaceId}`,
        });
      }

      return workspace;
    },

    async createWorkspace(body) {
      const workspace = createMockWorkspace(body);
      const extraWorkspaces = readMockExtraWorkspaces().filter(
        (candidate) => candidate.id !== workspace.id,
      );

      writeMockExtraWorkspaces([workspace, ...extraWorkspaces]);

      return workspace;
    },

    async listWorkspaceMembers(workspaceId) {
      const workspace = await this.getWorkspace(workspaceId);

      return [createMockMember(workspaceId, workspace)];
    },

    async createWorkspaceInvite(workspaceId, body = {}) {
      const workspace = await this.getWorkspace(workspaceId);
      const now = new Date();
      const invite = {
        id: `local-invite-${Date.now()}`,
        workspaceId: workspace.id,
        email:
          typeof body.email === "string" && body.email.trim()
            ? body.email.trim().toLowerCase()
            : "member@example.com",
        role: "member",
        token: `local-token-${Math.random().toString(36).slice(2, 10)}`,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: now.toISOString(),
      };

      writeMockInvites([invite, ...readMockInvites()]);

      return invite;
    },

    async acceptWorkspaceInvite(inviteId, body = {}) {
      const invite = readMockInvites().find((item) => item.id === inviteId);

      if (!invite || invite.token !== body.token) {
        throw new WorkspaceApiError("Failed to accept workspace invite", {
          status: 404,
          path: `/api/workspace-invites/${inviteId}/accept`,
        });
      }

      return {
        ok: true,
        workspaceId: invite.workspaceId,
        member: createMockMember(invite.workspaceId, {
          myRole: "member",
          createdAt: invite.createdAt,
        }),
      };
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
