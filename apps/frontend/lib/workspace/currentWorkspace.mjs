export const CURRENT_WORKSPACE_STORAGE_KEY = "pilo.currentWorkspaceId";

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

export function workspaceCanvasHref(workspaceId) {
  return `${workspaceDashboardHref(workspaceId)}/canvas`;
}
