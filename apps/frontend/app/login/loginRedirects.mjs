import { safeNextPath } from "../../lib/auth/protectedRoutes.mjs";
import { workspaceEntryHref } from "../../lib/workspace/currentWorkspace.mjs";

export function resolveWorkspaceLoginNextPath(nextPath) {
  const safePath = safeNextPath(nextPath, "");

  if (
    !safePath ||
    safePath === "/" ||
    safePath === "/workspace" ||
    safePath === "/workspace/"
  ) {
    return workspaceEntryHref();
  }

  return safePath;
}
