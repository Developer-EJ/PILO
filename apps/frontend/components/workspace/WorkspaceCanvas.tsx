"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createWorkspaceDashboardFixture } from "../../lib/workspace/dashboardClient.mjs";
import {
  createCanvasClient,
  createMockCanvasBoardDetail,
  resolveCanvasClientMode,
} from "../../lib/workspace/canvasClient.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";
import {
  extractWorkspaceIdFromPathname,
  workspaceCanvasHref,
  workspaceDashboardHref,
} from "../../lib/workspace/currentWorkspace.mjs";
import { CurrentWorkspaceSwitcher } from "./CurrentWorkspaceSwitcher";
import {
  PiloTldrawCanvas,
  type PiloCanvasActions,
  type PiloCanvasTool,
} from "./canvas/PiloTldrawCanvas";

type CanvasEntity = {
  id?: string;
  entityType: string;
  entityId: string;
  displayTitle: string;
  shapeType: string;
  width?: number;
  height?: number;
  color?: string;
  position?: {
    x: number;
    y: number;
  };
};

type CanvasBoardDetail = {
  id: string;
  title: string;
  workspaceId: string;
  shapeCount: number;
  connectionCount: number;
  shapes: CanvasEntity[];
  viewSetting: {
    zoom: number;
    viewportX: number;
    viewportY: number;
  };
  filterSetting: {
    enabledEntityTypes: string[];
    assigneeMemberId: string | null;
    showDelayedOnly: boolean;
    showRiskOnly: boolean;
    filters: Record<string, unknown>;
  };
};

type CanvasBoardState = {
  board: CanvasBoardDetail | null;
  source: "api" | "fixture";
  status: "loading" | "ready" | "fallback";
};

type CanvasNavItem = {
  label: string;
  active?: boolean;
  badge?: string;
  href?: string;
};

const canvasNavLabels = [
  "홈 / 대시보드",
  "프로젝트 시작",
  "기능 목록",
  "Task 보드",
  "회의 / Report",
  "음성채팅",
  "Canvas",
  "GitHub PR",
  "Code Review",
  "설정",
];

function resolveCanvasWorkspaceId(pathname: string) {
  return extractWorkspaceIdFromPathname(pathname) ?? mockWorkspaces[0].id;
}

function clampZoom(value: number) {
  return Math.min(2, Math.max(0.5, Math.round(value * 100) / 100));
}

function buildCanvasNavItems({
  workspaceId,
  taskCount,
  pullRequestCount,
}: {
  workspaceId: string;
  taskCount: number;
  pullRequestCount: number;
}): CanvasNavItem[] {
  return canvasNavLabels.map((label, index) => {
    if (index === 0) {
      return {
        label,
        href: workspaceDashboardHref(workspaceId),
      };
    }
    if (index === 3) {
      return {
        label,
        badge: String(taskCount),
      };
    }
    if (index === 6) {
      return {
        label,
        active: true,
        href: workspaceCanvasHref(workspaceId),
      };
    }
    if (index === 7) {
      return {
        label,
        badge: String(pullRequestCount),
      };
    }

    return { label };
  });
}

export function WorkspaceCanvas() {
  const pathname = usePathname() ?? "/";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [boardState, setBoardState] = useState<CanvasBoardState>({
    board: null,
    source: "fixture",
    status: "loading",
  });
  const [canvasActions, setCanvasActions] = useState<PiloCanvasActions | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);
  const workspaceId = useMemo(
    () => resolveCanvasWorkspaceId(pathname),
    [pathname],
  );
  const dashboard = useMemo(
    () => createWorkspaceDashboardFixture(workspaceId),
    [workspaceId],
  );
  const fallbackBoard = useMemo(
    () => createMockCanvasBoardDetail(workspaceId) as CanvasBoardDetail,
    [workspaceId],
  );
  const navItems = buildCanvasNavItems({
    workspaceId,
    taskCount: dashboard.tasks.length,
    pullRequestCount: dashboard.pullRequests.length,
  });
  const board = boardState.board ?? fallbackBoard;

  useEffect(() => {
    let cancelled = false;
    const canvasClient = createCanvasClient();
    const mode = resolveCanvasClientMode();

    async function loadCanvasBoard() {
      setBoardState({
        board: null,
        source: "fixture",
        status: "loading",
      });

      try {
        const boards = await canvasClient.listBoards(workspaceId);

        if (!boards.length) {
          throw new Error("Canvas board list is empty.");
        }

        const detail = (await canvasClient.getBoardDetail(boards[0].id, {
          workspaceId,
        })) as CanvasBoardDetail;

        if (cancelled) return;

        setBoardState({
          board: detail,
          source: mode === "api" ? "api" : "fixture",
          status: "ready",
        });
        setZoom(detail.viewSetting?.zoom ?? 1);
      } catch (error) {
        if (cancelled) return;

        const fallback = createMockCanvasBoardDetail(
          workspaceId,
        ) as CanvasBoardDetail;

        setBoardState({
          board: fallback,
          source: "fixture",
          status: "fallback",
        });
        setZoom(fallback.viewSetting.zoom);
      }
    }

    void loadCanvasBoard();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  function saveViewSetting(nextZoom: number) {
    const nextViewSetting = {
      zoom: nextZoom,
      viewportX: board.viewSetting.viewportX,
      viewportY: board.viewSetting.viewportY,
    };

    setZoom(nextZoom);
    setBoardState((current) =>
      current.board
        ? {
            ...current,
            board: {
              ...current.board,
              viewSetting: nextViewSetting,
            },
          }
        : current,
    );

    void createCanvasClient()
      .updateViewSetting(board.id, nextViewSetting)
      .catch(() => undefined);
  }

  function toggleRiskFilter() {
    const nextFilterSetting = {
      ...board.filterSetting,
      showRiskOnly: !board.filterSetting.showRiskOnly,
    };

    setBoardState((current) =>
      current.board
        ? {
            ...current,
            board: {
              ...current.board,
              filterSetting: nextFilterSetting,
            },
          }
        : current,
    );

    void createCanvasClient()
      .updateFilterSetting(board.id, nextFilterSetting)
      .catch(() => undefined);
  }

  function selectCanvasTool(tool: PiloCanvasTool) {
    canvasActions?.selectTool(tool);
  }

  return (
    <main
      className={
        isSidebarOpen
          ? "dashboard-shell canvas-shell is-sidebar-open"
          : "dashboard-shell canvas-shell"
      }
    >
      <button
        type="button"
        className="canvas-sidebar-toggle"
        aria-controls="canvas-sidebar"
        aria-expanded={isSidebarOpen}
        aria-label={isSidebarOpen ? "사이드바 닫기" : "사이드바 열기"}
        onClick={() => setIsSidebarOpen((current) => !current)}
      >
        {isSidebarOpen ? (
          <span className="canvas-sidebar-close" aria-hidden="true">
            x
          </span>
        ) : (
          <span className="canvas-sidebar-menu" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
      </button>

      <aside
        id="canvas-sidebar"
        className="sidebar"
        aria-label="PILO navigation"
      >
        <div className="brand">
          <CurrentWorkspaceSwitcher />
        </div>
        <nav className="nav-list" aria-label="Workspace navigation">
          {navItems.map((item) => {
            const className = item.active ? "nav-item active" : "nav-item";
            const content = (
              <>
                <span>{item.label}</span>
                {item.badge ? <b>{item.badge}</b> : null}
              </>
            );

            return item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className={className}
                aria-current={item.active ? "page" : undefined}
              >
                {content}
              </Link>
            ) : (
              <div key={item.label} className={className} aria-disabled="true">
                {content}
              </div>
            );
          })}
        </nav>
      </aside>

      <section
        className="workspace canvas-workspace"
        aria-label="Project canvas"
      >
        <header className="canvas-floating-bar canvas-floating-bar-left">
          <strong className="canvas-wordmark">PILO</strong>
          <button type="button" className="canvas-board-title">
            <span>{board.title}</span>
            <small>{dashboard.workspace.name}</small>
          </button>
          <button type="button" className="canvas-bar-button">
            저장
          </button>
          <button type="button" className="canvas-bar-button">
            보기
          </button>
        </header>

        <header className="canvas-floating-bar canvas-floating-bar-right">
          <button
            type="button"
            className="canvas-status-pill"
            onClick={toggleRiskFilter}
          >
            {boardState.source === "api" ? "API canvas" : "fixture canvas"}
          </button>
          <div className="avatar">민</div>
          <button type="button" className="canvas-share-button">
            공유
          </button>
        </header>

        <nav className="canvas-tool-rail" aria-label="Canvas tools">
          <button
            type="button"
            aria-label="선택"
            className="is-active"
            onClick={() => selectCanvasTool("select")}
          >
            V
          </button>
          <button
            type="button"
            aria-label="이동"
            onClick={() => selectCanvasTool("hand")}
          >
            H
          </button>
          <button
            type="button"
            aria-label="Task 카드 추가"
            onClick={() => canvasActions?.createEntityCard("task")}
          >
            Task
          </button>
          <button
            type="button"
            aria-label="PR 카드 추가"
            onClick={() => canvasActions?.createEntityCard("pull_request")}
          >
            PR
          </button>
          <button
            type="button"
            aria-label="회의 카드 추가"
            onClick={() => canvasActions?.createEntityCard("meeting_report")}
          >
            Mtg
          </button>
          <button
            type="button"
            aria-label="스티키 메모 추가"
            onClick={() => canvasActions?.createStickyNote()}
          >
            Note
          </button>
          <button
            type="button"
            aria-label="텍스트"
            onClick={() => selectCanvasTool("text")}
          >
            T
          </button>
          <button
            type="button"
            aria-label="연결선"
            onClick={() => selectCanvasTool("arrow")}
          >
            →
          </button>
        </nav>

        <section className="canvas-content" aria-label="Canvas board">
          <PiloTldrawCanvas
            board={board}
            dashboard={dashboard}
            onReady={setCanvasActions}
            onZoomChange={(nextZoom) => setZoom(clampZoom(nextZoom))}
          />
        </section>

        <div className="canvas-board-hud" aria-label="Canvas board status">
          <span>{dashboard.workspace.name}</span>
          <strong>
            {boardState.status === "loading" ? "loading" : board.id}
          </strong>
          <em>{board.shapeCount} nodes</em>
          <em>{board.connectionCount} relations</em>
        </div>

        <div className="canvas-zoom-controls" aria-label="Canvas zoom controls">
          <button
            type="button"
            aria-label="화면 맞춤"
            onClick={() => canvasActions?.fit()}
          >
            ⌂
          </button>
          <button
            type="button"
            aria-label="축소"
            onClick={() => {
              canvasActions?.zoomOut();
              saveViewSetting(clampZoom(zoom - 0.1));
            }}
          >
            -
          </button>
          <strong>{Math.round(zoom * 100)}%</strong>
          <button
            type="button"
            aria-label="확대"
            onClick={() => {
              canvasActions?.zoomIn();
              saveViewSetting(clampZoom(zoom + 0.1));
            }}
          >
            +
          </button>
        </div>
      </section>
    </main>
  );
}
