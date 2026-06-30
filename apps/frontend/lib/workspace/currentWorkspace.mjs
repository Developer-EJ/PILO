export const CURRENT_WORKSPACE_STORAGE_KEY = "pilo.currentWorkspaceId";
export const DEFAULT_WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
export const WORKSPACE_ENTRY_PATH = "/workspace";
export const WORKSPACE_ONBOARDING_PATH = "/workspace/new";

/**
 * @typedef {object} WorkspaceSummary
 * @property {string} id
 * @property {string} name
 */

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

export function extractWorkspaceIdFromPathname(pathname = "") {
  const match = pathname.match(/^\/workspaces\/([^/?#]+)/);

  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return match[1];
  }
}

export function readStoredWorkspaceId(storage = defaultWorkspaceStorage()) {
  try {
    return storage?.getItem(CURRENT_WORKSPACE_STORAGE_KEY) ?? null;
  } catch (error) {
    return null;
  }
}

export function writeStoredWorkspaceId(
  workspaceId,
  storage = defaultWorkspaceStorage(),
) {
  if (!workspaceId) {
    return;
  }

  try {
    storage?.setItem(CURRENT_WORKSPACE_STORAGE_KEY, workspaceId);
  } catch (error) {
    // Storage may be unavailable in privacy mode; URL state still works.
  }
}

function findWorkspace(workspaces, workspaceId) {
  if (!workspaceId) {
    return null;
  }

  return workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
}

/**
 * @param {object} input
 * @param {WorkspaceSummary[]} input.workspaces
 * @param {string | null} [input.urlWorkspaceId]
 * @param {string | null} [input.storedWorkspaceId]
 */
export function resolveCurrentWorkspaceSelection({
  workspaces,
  urlWorkspaceId = null,
  storedWorkspaceId = null,
}) {
  if (!workspaces.length) {
    return {
      status: "empty",
      source: "none",
      workspace: null,
      invalidWorkspaceId: null,
      shouldPersist: false,
      shouldReplaceRoute: false,
    };
  }

  if (urlWorkspaceId) {
    const urlWorkspace = findWorkspace(workspaces, urlWorkspaceId);

    if (urlWorkspace) {
      return {
        status: "selected",
        source: "url",
        workspace: urlWorkspace,
        invalidWorkspaceId: null,
        shouldPersist: true,
        shouldReplaceRoute: false,
      };
    }

    return {
      status: "url_not_found",
      source: "url",
      workspace: null,
      invalidWorkspaceId: urlWorkspaceId,
      fallbackWorkspace:
        findWorkspace(workspaces, storedWorkspaceId) ?? workspaces[0],
      shouldPersist: false,
      shouldReplaceRoute: false,
    };
  }

  const storedWorkspace = findWorkspace(workspaces, storedWorkspaceId);

  if (storedWorkspace) {
    return {
      status: "selected",
      source: "storage",
      workspace: storedWorkspace,
      invalidWorkspaceId: null,
      shouldPersist: false,
      shouldReplaceRoute: true,
    };
  }

  return {
    status: "selected",
    source: "default",
    workspace: workspaces[0],
    invalidWorkspaceId: null,
    shouldPersist: true,
    shouldReplaceRoute: true,
  };
}

export function workspaceDashboardHref(workspaceId) {
  return `/workspaces/${encodeURIComponent(workspaceId)}`;
}

export function defaultWorkspaceDashboardHref(workspaceId = DEFAULT_WORKSPACE_ID) {
  return workspaceDashboardHref(workspaceId || DEFAULT_WORKSPACE_ID);
}

export function workspaceEntryHref() {
  return WORKSPACE_ENTRY_PATH;
}

export function workspaceOnboardingHref() {
  return WORKSPACE_ONBOARDING_PATH;
}

/**
 * @param {object} input
 * @param {WorkspaceSummary[]} [input.workspaces]
 * @param {string | null} [input.storedWorkspaceId]
 */
export function resolveWorkspaceEntryDestination({
  workspaces,
  storedWorkspaceId = null,
} = {}) {
  const safeWorkspaces = Array.isArray(workspaces) ? workspaces : [];

  if (!safeWorkspaces.length) {
    return {
      kind: "onboarding",
      source: "empty",
      workspace: null,
      href: workspaceOnboardingHref(),
    };
  }

  const selection = resolveCurrentWorkspaceSelection({
    workspaces: safeWorkspaces,
    storedWorkspaceId,
  });
  const workspace =
    selection.workspace ?? selection.fallbackWorkspace ?? safeWorkspaces[0];

  if (!workspace?.id) {
    return {
      kind: "onboarding",
      source: "invalid",
      workspace: null,
      href: workspaceOnboardingHref(),
    };
  }

  return {
    kind: "workspace",
    source: selection.source,
    workspace,
    href: workspaceDashboardHref(workspace.id),
    shouldPersist: selection.shouldPersist,
  };
}

export function workspaceCanvasHref(workspaceId) {
  return `${workspaceDashboardHref(workspaceId)}/canvas`;
}

export function workspaceCanvasBoardHref(workspaceId, boardId) {
  const params = new URLSearchParams({ boardId });

  return `${workspaceCanvasHref(workspaceId)}?${params.toString()}`;
}
