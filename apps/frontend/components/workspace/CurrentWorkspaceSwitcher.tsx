"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  createWorkspaceClient,
  mockWorkspaces,
} from "../../lib/workspace/workspaceClient.mjs";
import {
  extractWorkspaceIdFromPathname,
  readStoredWorkspaceId,
  resolveCurrentWorkspaceSelection,
  workspaceDashboardHref,
  writeStoredWorkspaceId,
} from "../../lib/workspace/currentWorkspace.mjs";

type WorkspaceSummary = (typeof mockWorkspaces)[number];

type WorkspaceSelectionState = {
  status: "loading" | "ready" | "empty" | "url_not_found" | "error";
  workspaces: WorkspaceSummary[];
  selectedWorkspace: WorkspaceSummary | null;
  invalidWorkspaceId: string | null;
};

const initialState: WorkspaceSelectionState = {
  status: "loading",
  workspaces: [],
  selectedWorkspace: null,
  invalidWorkspaceId: null,
};

export function CurrentWorkspaceSwitcher() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const switcherRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<WorkspaceSelectionState>(initialState);
  const urlWorkspaceId = useMemo(
    () => extractWorkspaceIdFromPathname(pathname),
    [pathname],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaces() {
      const workspaceClient = createWorkspaceClient();
      const workspaces = await workspaceClient.listWorkspaces();
      const selection = resolveCurrentWorkspaceSelection({
        workspaces,
        urlWorkspaceId,
        storedWorkspaceId: readStoredWorkspaceId(),
      });

      if (cancelled) {
        return;
      }

      if (selection.status === "empty") {
        setState({
          status: "empty",
          workspaces,
          selectedWorkspace: null,
          invalidWorkspaceId: null,
        });
        return;
      }

      if (selection.status === "url_not_found") {
        setState({
          status: "url_not_found",
          workspaces,
          selectedWorkspace: null,
          invalidWorkspaceId: selection.invalidWorkspaceId,
        });
        return;
      }

      if (selection.shouldPersist) {
        writeStoredWorkspaceId(selection.workspace.id);
      }

      setState({
        status: "ready",
        workspaces,
        selectedWorkspace: selection.workspace,
        invalidWorkspaceId: null,
      });

      if (selection.shouldReplaceRoute) {
        router.replace(workspaceDashboardHref(selection.workspace.id));
      }
    }

    loadWorkspaces().catch(() => {
      if (!cancelled) {
        setState({
          status: "error",
          workspaces: [],
          selectedWorkspace: null,
          invalidWorkspaceId: null,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router, urlWorkspaceId]);

  useEffect(() => {
    function closeWhenClickedOutside(event: MouseEvent) {
      if (!switcherRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeWhenClickedOutside);

    return () => {
      document.removeEventListener("mousedown", closeWhenClickedOutside);
    };
  }, []);

  function handleWorkspaceChange(nextWorkspaceId: string) {
    writeStoredWorkspaceId(nextWorkspaceId);
    setIsOpen(false);
    router.push(workspaceDashboardHref(nextWorkspaceId));
  }

  const isWarning =
    state.status === "url_not_found" ||
    state.status === "empty" ||
    state.status === "error";
  const selectedName = state.selectedWorkspace?.name ?? "PILO";
  const selectedDescription =
    state.selectedWorkspace?.description ?? "AI Project OS";

  if (state.status === "loading") {
    return (
      <div className="workspace-brand-switcher workspace-brand-switcher-muted">
        <div className="brand-mark">P</div>
        <div className="workspace-brand-copy">
          <p>PILO</p>
          <span>Workspace 확인 중</span>
        </div>
      </div>
    );
  }

  if (state.status === "empty" || state.status === "error") {
    return (
      <div className="workspace-brand-switcher workspace-brand-switcher-warning">
        <div className="brand-mark">P</div>
        <div className="workspace-brand-copy">
          <p>PILO</p>
          <span>
            {state.status === "empty"
              ? "Workspace 생성 필요"
              : "Workspace 목록 로드 실패"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={switcherRef}
      className={
        isWarning
          ? "workspace-brand-switcher workspace-brand-switcher-warning"
          : "workspace-brand-switcher"
      }
    >
      <button
        type="button"
        className="workspace-brand-button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="현재 workspace 선택"
        onClick={() => setIsOpen((open) => !open)}
      >
        <div className="brand-mark" aria-hidden="true">
          P
        </div>
        <div className="workspace-brand-copy">
          <p>
            {state.status === "url_not_found"
              ? "접근 불가 Workspace"
              : selectedName}
          </p>
          <span>
            {state.status === "url_not_found"
              ? state.invalidWorkspaceId
              : selectedDescription}
          </span>
        </div>
        <span className="workspace-brand-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen ? (
        <div className="workspace-brand-menu" role="listbox">
          {state.status === "url_not_found" ? (
            <div className="workspace-brand-menu-note">
              현재 URL의 workspace를 찾을 수 없어요.
            </div>
          ) : null}
          {state.workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              className={
                workspace.id === state.selectedWorkspace?.id
                  ? "workspace-brand-option active"
                  : "workspace-brand-option"
              }
              role="option"
              aria-selected={workspace.id === state.selectedWorkspace?.id}
              onClick={() => handleWorkspaceChange(workspace.id)}
            >
              <strong>{workspace.name}</strong>
              <span>{workspace.description}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
