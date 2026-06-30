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
    state.selectedWorkspace?.description ?? "AI 프로젝트 OS";

  if (state.status === "loading") {
    return (
      <div className="workspace-brand-switcher workspace-brand-switcher-muted">
        <div className="brand-mark">P</div>
        <div className="workspace-brand-copy">
          <p>PILO</p>
          <span>워크스페이스 불러오는 중</span>
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
              ? "워크스페이스 생성 필요"
              : "목록을 불러오지 못함"}
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
        aria-label="현재 워크스페이스 선택"
        onClick={() => setIsOpen((open) => !open)}
      >
        <div className="brand-mark" aria-hidden="true">
          P
        </div>
        <div className="workspace-brand-copy">
          <p>
            {state.status === "url_not_found"
              ? "알 수 없는 워크스페이스"
              : selectedName}
          </p>
          <span>
            {state.status === "url_not_found"
              ? state.invalidWorkspaceId
              : selectedDescription}
          </span>
        </div>
        <span className="workspace-brand-caret" aria-hidden="true">
          v
        </span>
      </button>

      {isOpen ? (
        <div className="workspace-brand-menu" role="listbox">
          {state.status === "url_not_found" ? (
            <div className="workspace-brand-menu-note">
              이 URL의 워크스페이스를 찾을 수 없습니다.
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
