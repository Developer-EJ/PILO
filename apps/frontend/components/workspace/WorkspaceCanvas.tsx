"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { CurrentUserAvatar } from "../auth/CurrentUserAvatar";
import { LogoutButton } from "../auth/LogoutButton";
import { createWorkspaceDashboardFixture } from "../../lib/workspace/dashboardClient.mjs";
import {
  createCanvasClient,
  createMockCanvasBoardDetail,
  resolveCanvasClientMode,
} from "../../lib/workspace/canvasClient.mjs";
import {
  applyCanvasShapeState,
  CANVAS_FILTER_ENTITY_TYPES,
  filterCanvasBoard,
  normalizeCanvasFilterSetting,
  normalizeCanvasShapeState,
  readCanvasStorage,
  writeCanvasStorage,
} from "../../lib/workspace/canvasStorage.mjs";
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
  type PiloDrawingPreset,
  type PiloCanvasSelection,
  type PiloCanvasShapeState,
  type PiloCanvasTool,
} from "./canvas/PiloTldrawCanvas";
import {
  piloStickyNoteColors,
  type PiloStickyNoteColor,
} from "./canvas/PiloStickyNoteShapeUtil";

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

type CanvasConnection = {
  id: string;
  sourceShapeId: string;
  targetShapeId: string;
  connectionType: string;
  label: string | null;
};

type CanvasViewSetting = {
  zoom: number;
  viewportX: number;
  viewportY: number;
};

type CanvasFilterSetting = {
  enabledEntityTypes: string[];
  assigneeMemberId: string | null;
  showDelayedOnly: boolean;
  showRiskOnly: boolean;
  filters: Record<string, unknown>;
};

type CanvasBoardDetail = {
  id: string;
  title: string;
  workspaceId: string;
  shapeCount: number;
  connectionCount: number;
  shapes: CanvasEntity[];
  connections: CanvasConnection[];
  viewSetting: CanvasViewSetting;
  filterSetting: CanvasFilterSetting;
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
  "작업 보드",
  "회의 / Report",
  "음성채팅",
  "Canvas",
  "GitHub PR",
  "코드 리뷰",
  "설정",
];

const canvasFilterLabels: Record<string, string> = {
  task: "작업",
  meeting_report: "회의",
  pull_request: "PR",
  github_issue: "이슈",
  document: "문서",
  file: "파일",
  code: "코드",
  decision: "결정",
  risk: "위험",
};

const drawingColorOptions: {
  label: string;
  value: PiloDrawingPreset;
  className: string;
}[] = [
  { label: "검정", value: "black", className: "is-black" },
  { label: "빨강", value: "red", className: "is-red" },
  { label: "노랑", value: "yellow", className: "is-yellow" },
  { label: "초록", value: "green", className: "is-green" },
  { label: "파랑", value: "blue", className: "is-blue" },
  { label: "보라", value: "violet", className: "is-violet" },
];

type CanvasToolIconType =
  | "sparkles"
  | "select"
  | "hand"
  | "task"
  | "pull_request"
  | "meeting_report"
  | "note"
  | "code"
  | "text"
  | "arrow"
  | "draw"
  | "highlight"
  | "eraser"
  | "rectangle"
  | "circle"
  | "frame"
  | "palette"
  | "comment"
  | "plus"
  | "undo"
  | "redo";

function CanvasToolIcon({ type }: { type: CanvasToolIconType }) {
  const commonProps = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (type === "sparkles") {
    return (
      <svg {...commonProps} fill="currentColor" stroke="none">
        <path d="M9.5 3.5 11 7l3.5 1.5L11 10 9.5 13.5 8 10 4.5 8.5 8 7z" />
        <path d="M16.5 2 17.7 4.8 20.5 6l-2.8 1.2L16.5 10l-1.2-2.8L12.5 6l2.8-1.2z" />
        <path d="M17.5 13 19 16.5 22.5 18 19 19.5 17.5 23 16 19.5 12.5 18l3.5-1.5z" />
      </svg>
    );
  }

  if (type === "select") {
    return (
      <svg {...commonProps}>
        <path d="M5 3l13 8-6 2-3 6z" />
      </svg>
    );
  }

  if (type === "hand") {
    return (
      <svg {...commonProps}>
        <path d="M8 12V6a2 2 0 0 1 4 0v5" />
        <path d="M12 11V5a2 2 0 0 1 4 0v7" />
        <path d="M16 12V8a2 2 0 0 1 4 0v6a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.6-3.8L4.8 12a2 2 0 1 1 3.7-1.5L10 14" />
      </svg>
    );
  }

  if (type === "task") {
    return (
      <svg {...commonProps}>
        <rect x="5" y="4" width="14" height="16" rx="3" />
        <path d="M9 9h6" />
        <path d="M9 13h4" />
      </svg>
    );
  }

  if (type === "pull_request") {
    return (
      <svg {...commonProps}>
        <circle cx="7" cy="6" r="2" />
        <circle cx="17" cy="18" r="2" />
        <path d="M7 8v10" />
        <path d="M17 16V9a3 3 0 0 0-3-3h-2" />
        <path d="M13 3l-3 3 3 3" />
      </svg>
    );
  }

  if (type === "meeting_report") {
    return (
      <svg {...commonProps}>
        <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M4 19a4 4 0 0 1 8 0" />
        <path d="M12 19a4 4 0 0 1 8 0" />
      </svg>
    );
  }

  if (type === "note") {
    return (
      <svg {...commonProps}>
        <path d="M6 4h12v11l-5 5H6z" />
        <path d="M13 20v-5h5" />
      </svg>
    );
  }

  if (type === "code") {
    return (
      <svg {...commonProps}>
        <path d="m8 9-4 3 4 3" />
        <path d="m16 9 4 3-4 3" />
        <path d="m14 5-4 14" />
      </svg>
    );
  }

  if (type === "text") {
    return (
      <svg {...commonProps}>
        <path d="M5 6h14" />
        <path d="M12 6v12" />
        <path d="M9 18h6" />
      </svg>
    );
  }

  if (type === "draw") {
    return (
      <svg {...commonProps}>
        <path d="M4 20c4.5-1 3.5-5 7-7l6-6a2.1 2.1 0 0 1 3 3l-6 6c-2 3.5-6 2.5-7 7" />
        <path d="M13 7l4 4" />
      </svg>
    );
  }

  if (type === "highlight") {
    return (
      <svg {...commonProps}>
        <path d="m5 17 9-9 3 3-9 9H5z" />
        <path d="m13 7 2-2a2.1 2.1 0 0 1 3 3l-2 2" />
        <path d="M4 21h8" />
      </svg>
    );
  }

  if (type === "eraser") {
    return (
      <svg {...commonProps}>
        <path d="m7 21-4-4 9-9 6 6-7 7z" />
        <path d="m14 7 2-2a2.1 2.1 0 0 1 3 3l-2 2" />
        <path d="M11 21h9" />
      </svg>
    );
  }

  if (type === "rectangle") {
    return (
      <svg {...commonProps}>
        <rect x="5" y="6" width="14" height="12" rx="2" />
        <path d="M16 3v4" />
        <path d="M18 5h-4" />
      </svg>
    );
  }

  if (type === "circle") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="8" />
      </svg>
    );
  }

  if (type === "frame") {
    return (
      <svg {...commonProps}>
        <rect x="5" y="5" width="14" height="14" />
        <path d="M3 9h4" />
        <path d="M17 9h4" />
        <path d="M3 15h4" />
        <path d="M17 15h4" />
      </svg>
    );
  }

  if (type === "palette") {
    return (
      <svg {...commonProps}>
        <path d="M12 4a8 8 0 0 0-3.5 15.2c1 .4 1.7-.3 1.7-1.1 0-.7.5-1.3 1.2-1.3h1.4A7.2 7.2 0 0 0 20 10.5C20 6.9 16.4 4 12 4z" />
        <circle cx="8.7" cy="10" r="1" />
        <circle cx="11.5" cy="7.8" r="1" />
        <circle cx="15" cy="8.7" r="1" />
        <circle cx="15.8" cy="12.3" r="1" />
      </svg>
    );
  }

  if (type === "comment") {
    return (
      <svg {...commonProps}>
        <path d="M5 18.5V8a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v3.5a4 4 0 0 1-4 4H9l-4 3z" />
        <path d="M9 9.5h6" />
        <path d="M9 12.5h4" />
      </svg>
    );
  }

  if (type === "plus") {
    return (
      <svg {...commonProps}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }

  if (type === "undo") {
    return (
      <svg {...commonProps}>
        <path d="M9 8H4V3" />
        <path d="M4 8c3.5-3.5 9.5-3.5 13 0a7 7 0 0 1 1.8 6.8" />
      </svg>
    );
  }

  if (type === "redo") {
    return (
      <svg {...commonProps}>
        <path d="M15 8h5V3" />
        <path d="M20 8c-3.5-3.5-9.5-3.5-13 0a7 7 0 0 0-1.8 6.8" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M5 19 19 5" />
      <path d="M13 5h6v6" />
    </svg>
  );
}

function resolveCanvasWorkspaceId(pathname: string) {
  return extractWorkspaceIdFromPathname(pathname) ?? mockWorkspaces[0].id;
}

function clampZoom(value: number) {
  return Math.min(2, Math.max(0.5, Math.round(value * 100) / 100));
}

function isCanvasViewSetting(value: unknown): value is CanvasViewSetting {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const setting = value as Record<string, unknown>;

  return (
    typeof setting.zoom === "number" &&
    Number.isFinite(setting.zoom) &&
    typeof setting.viewportX === "number" &&
    Number.isFinite(setting.viewportX) &&
    typeof setting.viewportY === "number" &&
    Number.isFinite(setting.viewportY)
  );
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

function formatPosition(selection: PiloCanvasSelection) {
  if (!selection) return "-";

  return `${Math.round(selection.x)}, ${Math.round(selection.y)}`;
}

function formatSize(selection: PiloCanvasSelection) {
  if (!selection) return "-";

  return `${Math.round(selection.width)} x ${Math.round(selection.height)}`;
}

function areShapeStatesEqual(
  current: Record<string, PiloCanvasShapeState>,
  next: Record<string, PiloCanvasShapeState>,
) {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);

  if (currentKeys.length !== nextKeys.length) return false;

  return currentKeys.every((key) => {
    const currentShape = current[key];
    const nextShape = next[key];

    return (
      currentShape &&
      nextShape &&
      currentShape.x === nextShape.x &&
      currentShape.y === nextShape.y &&
      currentShape.width === nextShape.width &&
      currentShape.height === nextShape.height
    );
  });
}

function areViewSettingsEqual(
  current: CanvasViewSetting,
  next: CanvasViewSetting,
) {
  return (
    current.zoom === next.zoom &&
    current.viewportX === next.viewportX &&
    current.viewportY === next.viewportY
  );
}

function areSelectionsEqual(
  current: PiloCanvasSelection,
  next: PiloCanvasSelection,
) {
  if (current === next) return true;
  if (!current || !next) return false;

  return (
    current.canvasShapeId === next.canvasShapeId &&
    current.x === next.x &&
    current.y === next.y &&
    current.width === next.width &&
    current.height === next.height &&
    current.title === next.title &&
    current.status === next.status
  );
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
  const [activeCanvasTool, setActiveCanvasTool] =
    useState<PiloCanvasTool>("select");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isDrawMenuOpen, setIsDrawMenuOpen] = useState(false);
  const [isDrawColorMenuOpen, setIsDrawColorMenuOpen] = useState(false);
  const [isMemoMenuOpen, setIsMemoMenuOpen] = useState(false);
  const [activeMemoColor, setActiveMemoColor] =
    useState<PiloStickyNoteColor>("butter");
  const [activeDrawingPreset, setActiveDrawingPreset] =
    useState<PiloDrawingPreset>("pen");
  const [shapeStateById, setShapeStateById] = useState<
    Record<string, PiloCanvasShapeState>
  >({});
  const [selectedCard, setSelectedCard] = useState<PiloCanvasSelection>(null);
  const [filterSetting, setFilterSetting] =
    useState<CanvasFilterSetting | null>(null);
  const [viewSetting, setViewSetting] = useState<CanvasViewSetting>({
    zoom: 1,
    viewportX: 0,
    viewportY: 0,
  });
  const [hasStoredViewSetting, setHasStoredViewSetting] = useState(false);
  const [canvasHydrationVersion, setCanvasHydrationVersion] = useState(0);
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
  const activeFilterSetting = filterSetting ?? board.filterSetting;
  const persistedBoard = useMemo(
    () => ({
      ...board,
      shapes: applyCanvasShapeState(board.shapes, shapeStateById),
    }),
    [board, shapeStateById],
  );
  const visibleBoard = useMemo(
    () => filterCanvasBoard(persistedBoard, activeFilterSetting, dashboard),
    [activeFilterSetting, dashboard, persistedBoard],
  );
  const activeDrawingColor =
    drawingColorOptions.find((color) => color.value === activeDrawingPreset) ??
    drawingColorOptions[4];

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
      }
    }

    void loadCanvasBoard();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    const storedShapeState = normalizeCanvasShapeState(
      readCanvasStorage("shape-state", board.id),
    );
    const storedFilterSetting = normalizeCanvasFilterSetting(
      readCanvasStorage("filter-setting", board.id),
      board.filterSetting,
    );
    const storedViewSetting = readCanvasStorage("view-setting", board.id);

    queueMicrotask(() => {
      if (cancelled) return;

      setShapeStateById(storedShapeState);
      setFilterSetting(storedFilterSetting);

      if (isCanvasViewSetting(storedViewSetting)) {
        setViewSetting(storedViewSetting);
        setHasStoredViewSetting(true);
      } else {
        setViewSetting(board.viewSetting);
        setHasStoredViewSetting(false);
      }

      setCanvasHydrationVersion((version) => version + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [board.id, board.filterSetting, board.viewSetting]);

  const persistShapeState = useCallback(
    (nextShapeStateById: Record<string, PiloCanvasShapeState>) => {
      setShapeStateById((currentShapeStateById) => {
        if (areShapeStatesEqual(currentShapeStateById, nextShapeStateById)) {
          return currentShapeStateById;
        }

        writeCanvasStorage("shape-state", board.id, nextShapeStateById);

        return nextShapeStateById;
      });
    },
    [board.id],
  );

  const persistViewSetting = useCallback(
    (nextViewSetting: CanvasViewSetting) => {
      const normalizedViewSetting = {
        zoom: clampZoom(nextViewSetting.zoom),
        viewportX: nextViewSetting.viewportX,
        viewportY: nextViewSetting.viewportY,
      };

      setViewSetting((currentViewSetting) =>
        areViewSettingsEqual(currentViewSetting, normalizedViewSetting)
          ? currentViewSetting
          : normalizedViewSetting,
      );
      setHasStoredViewSetting(true);
      writeCanvasStorage("view-setting", board.id, normalizedViewSetting);
    },
    [board.id],
  );

  const persistFilterSetting = useCallback(
    (nextFilterSetting: CanvasFilterSetting) => {
      setFilterSetting(nextFilterSetting);
      writeCanvasStorage("filter-setting", board.id, nextFilterSetting);
    },
    [board.id],
  );

  function selectCanvasTool(tool: PiloCanvasTool) {
    setIsDrawMenuOpen(false);
    setIsDrawColorMenuOpen(false);
    setIsMemoMenuOpen(false);
    setActiveCanvasTool(tool);
    canvasActions?.selectTool(tool);
  }

  function selectDrawingPreset(preset: PiloDrawingPreset) {
    setIsMemoMenuOpen(false);
    setIsDrawMenuOpen(true);
    setIsDrawColorMenuOpen(false);
    setActiveDrawingPreset(preset);
    setActiveCanvasTool("draw");
    canvasActions?.selectDrawingPreset(preset);
  }

  function selectFrameTool() {
    setIsDrawMenuOpen(false);
    setIsDrawColorMenuOpen(false);
    setIsMemoMenuOpen(false);
    setActiveCanvasTool("frame");
    canvasActions?.selectTool("frame");
  }

  function openMemoMenu() {
    setIsDrawMenuOpen(false);
    setIsDrawColorMenuOpen(false);
    setIsMemoMenuOpen(true);
    setActiveCanvasTool("select");
    canvasActions?.selectTool("select");
  }

  function createMemo(color = activeMemoColor) {
    setActiveMemoColor(color);
    canvasActions?.createStickyNote(color);
  }

  function createMemoStack() {
    canvasActions?.createStickyStack(activeMemoColor);
  }

  function createCodeBlock() {
    setIsDrawMenuOpen(false);
    setIsDrawColorMenuOpen(false);
    setIsMemoMenuOpen(false);
    setActiveCanvasTool("code");
    canvasActions?.createCodeBlock();
  }

  const handleSelectionChange = useCallback(
    (nextSelection: PiloCanvasSelection) => {
      setSelectedCard((currentSelection) =>
        areSelectionsEqual(currentSelection, nextSelection)
          ? currentSelection
          : nextSelection,
      );
    },
    [],
  );

  function toggleEntityType(entityType: string) {
    const enabledEntityTypes = activeFilterSetting.enabledEntityTypes.includes(
      entityType,
    )
      ? activeFilterSetting.enabledEntityTypes.filter(
          (currentType) => currentType !== entityType,
        )
      : [...activeFilterSetting.enabledEntityTypes, entityType];

    persistFilterSetting({
      ...activeFilterSetting,
      enabledEntityTypes: enabledEntityTypes.length
        ? enabledEntityTypes
        : [entityType],
    });
  }

  function toggleDelayedFilter() {
    persistFilterSetting({
      ...activeFilterSetting,
      showDelayedOnly: !activeFilterSetting.showDelayedOnly,
    });
  }

  function toggleRiskFilter() {
    persistFilterSetting({
      ...activeFilterSetting,
      showRiskOnly: !activeFilterSetting.showRiskOnly,
    });
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
            저장됨
          </button>
          <button type="button" className="canvas-bar-button">
            보기
          </button>
        </header>

        <header className="canvas-floating-bar canvas-floating-bar-right">
          <button type="button" className="canvas-status-pill">
            {boardState.source === "api" ? "API canvas" : "fixture canvas"}
          </button>
          <LogoutButton />
          <CurrentUserAvatar />
          <button type="button" className="canvas-share-button">
            공유
          </button>
        </header>

        <nav className="canvas-tool-rail" aria-label="캔버스 도구와 필터">
          <button
            type="button"
            className="canvas-ai-tool"
            aria-label="AI 제안 카드 추가"
            data-tooltip="AI 제안"
            onClick={() => canvasActions?.createEntityCard("decision")}
          >
            <CanvasToolIcon type="sparkles" />
          </button>

          <section className="canvas-tool-section" aria-label="캔버스 도구">
            <button
              type="button"
              aria-label="선택"
              data-tooltip="선택"
              className={activeCanvasTool === "select" ? "is-active" : ""}
              onClick={() => selectCanvasTool("select")}
            >
              <CanvasToolIcon type="select" />
            </button>
            <button
              type="button"
              aria-label="작업 카드 추가"
              data-tooltip="작업"
              onClick={() => canvasActions?.createEntityCard("task")}
            >
              <CanvasToolIcon type="task" />
            </button>
            <button
              type="button"
              aria-label="프레임 도구"
              data-tooltip="프레임"
              className={activeCanvasTool === "frame" ? "is-active" : ""}
              onClick={selectFrameTool}
            >
              <CanvasToolIcon type="frame" />
            </button>
            <button
              type="button"
              aria-label="스티키 메모 추가"
              data-tooltip="메모"
              className={isMemoMenuOpen ? "is-active" : ""}
              onClick={openMemoMenu}
            >
              <CanvasToolIcon type="note" />
            </button>
            <button
              type="button"
              aria-label="코드블럭 추가"
              data-tooltip="코드블럭"
              className={activeCanvasTool === "code" ? "is-active" : ""}
              onClick={createCodeBlock}
            >
              <CanvasToolIcon type="code" />
            </button>
            <button
              type="button"
              aria-label="텍스트"
              data-tooltip="텍스트"
              className={activeCanvasTool === "text" ? "is-active" : ""}
              onClick={() => selectCanvasTool("text")}
            >
              <CanvasToolIcon type="text" />
            </button>
            <button
              type="button"
              aria-label="연결선"
              data-tooltip="연결선"
              className={activeCanvasTool === "arrow" ? "is-active" : ""}
              onClick={() => selectCanvasTool("arrow")}
            >
              <CanvasToolIcon type="arrow" />
            </button>
            <button
              type="button"
              aria-label="그리기"
              data-tooltip="그리기"
              className={activeCanvasTool === "draw" ? "is-active" : ""}
              onClick={() => {
                setIsDrawMenuOpen(true);
                selectDrawingPreset(activeDrawingPreset);
              }}
            >
              <CanvasToolIcon type="draw" />
            </button>
            <button
              type="button"
              aria-label="화면 맞춤"
              data-tooltip="화면 맞춤"
              onClick={() => canvasActions?.fit()}
            >
              <CanvasToolIcon type="frame" />
            </button>
            <button
              type="button"
              aria-label="필터 열기"
              data-tooltip="필터"
              className={isFilterMenuOpen ? "is-active" : ""}
              onClick={() => setIsFilterMenuOpen((current) => !current)}
            >
              <CanvasToolIcon type="palette" />
            </button>
            <button
              type="button"
              aria-label="회의 카드 추가"
              data-tooltip="회의"
              onClick={() => canvasActions?.createEntityCard("meeting_report")}
            >
              <CanvasToolIcon type="comment" />
            </button>
            <button
              type="button"
              aria-label="카드 추가"
              data-tooltip="추가"
              onClick={() => canvasActions?.createEntityCard("task")}
            >
              <CanvasToolIcon type="plus" />
            </button>
          </section>

          {isDrawMenuOpen ? (
            <section
              className="canvas-tool-popover canvas-draw-popover"
              aria-label="펜 세부 도구"
            >
              <button
                type="button"
                aria-label="펜"
                data-tooltip="펜"
                className={activeDrawingPreset === "pen" ? "is-active" : ""}
                onClick={() => selectDrawingPreset("pen")}
              >
                <CanvasToolIcon type="draw" />
              </button>
              <button
                type="button"
                aria-label="형광펜"
                data-tooltip="형광펜"
                className={
                  activeDrawingPreset === "highlight" ? "is-active" : ""
                }
                onClick={() => selectDrawingPreset("highlight")}
              >
                <CanvasToolIcon type="highlight" />
              </button>
              <button
                type="button"
                aria-label="사각형"
                data-tooltip="사각형"
                className={
                  activeDrawingPreset === "rectangle" ? "is-active" : ""
                }
                onClick={() => selectDrawingPreset("rectangle")}
              >
                <CanvasToolIcon type="rectangle" />
              </button>
              <button
                type="button"
                aria-label="지우개"
                data-tooltip="지우개"
                className={activeDrawingPreset === "eraser" ? "is-active" : ""}
                onClick={() => selectDrawingPreset("eraser")}
              >
                <CanvasToolIcon type="eraser" />
              </button>
              <button
                type="button"
                aria-label="원"
                data-tooltip="원"
                className={activeDrawingPreset === "circle" ? "is-active" : ""}
                onClick={() => selectDrawingPreset("circle")}
              >
                <CanvasToolIcon type="circle" />
              </button>
              <div className="canvas-draw-color-picker">
                <button
                  type="button"
                  aria-label="펜 색상"
                  data-tooltip="펜 색상"
                  className={isDrawColorMenuOpen ? "is-active" : ""}
                  onClick={() => setIsDrawColorMenuOpen((current) => !current)}
                >
                  <span
                    className={`canvas-color-swatch ${activeDrawingColor.className}`}
                  />
                </button>
                {isDrawColorMenuOpen ? (
                  <div
                    className="canvas-draw-color-menu"
                    aria-label="펜 색상 선택"
                  >
                    {drawingColorOptions.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        aria-label={`${color.label} 펜 선택`}
                        data-tooltip={`${color.label} 펜`}
                        className={
                          activeDrawingPreset === color.value ? "is-active" : ""
                        }
                        onClick={() => selectDrawingPreset(color.value)}
                      >
                        <span
                          className={`canvas-color-swatch ${color.className}`}
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {isMemoMenuOpen ? (
            <section
              className="canvas-tool-popover canvas-memo-popover"
              aria-label="메모 색상과 생성"
            >
              <div className="canvas-memo-color-grid">
                {piloStickyNoteColors.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    aria-label={`${color.label} 메모 생성`}
                    data-tooltip={color.label}
                    className={
                      activeMemoColor === color.value ? "is-active" : ""
                    }
                    style={{
                      background: color.fill,
                      borderColor: color.border,
                    }}
                    onClick={() => createMemo(color.value)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="canvas-memo-command"
                aria-label="선택 색상 메모 생성"
                data-tooltip="생성"
                onClick={() => createMemo()}
              >
                <CanvasToolIcon type="sparkles" />
                <span>생성</span>
              </button>
              <button
                type="button"
                className="canvas-memo-command"
                aria-label="메모 스택 생성"
                data-tooltip="스택"
                onClick={createMemoStack}
              >
                <CanvasToolIcon type="note" />
                <span>스택</span>
              </button>
            </section>
          ) : null}

          {isFilterMenuOpen ? (
            <section
              className="canvas-tool-popover canvas-filter-popover"
              aria-label="캔버스 필터"
            >
              <strong>필터</strong>
              <div>
                {CANVAS_FILTER_ENTITY_TYPES.map((entityType) => (
                  <button
                    key={entityType}
                    type="button"
                    aria-label={`${canvasFilterLabels[entityType]} 필터`}
                    data-tooltip={`${canvasFilterLabels[entityType]} 필터`}
                    className={
                      activeFilterSetting.enabledEntityTypes.includes(
                        entityType,
                      )
                        ? "is-active"
                        : ""
                    }
                    onClick={() => toggleEntityType(entityType)}
                  >
                    {canvasFilterLabels[entityType]}
                  </button>
                ))}
              </div>
              <div>
                <button
                  type="button"
                  aria-label="지연 항목만 보기"
                  data-tooltip="지연 항목"
                  className={
                    activeFilterSetting.showDelayedOnly ? "is-active" : ""
                  }
                  onClick={toggleDelayedFilter}
                >
                  지연
                </button>
                <button
                  type="button"
                  aria-label="위험 항목만 보기"
                  data-tooltip="위험 항목"
                  className={
                    activeFilterSetting.showRiskOnly ? "is-active" : ""
                  }
                  onClick={toggleRiskFilter}
                >
                  위험
                </button>
              </div>
            </section>
          ) : null}

          <section className="canvas-history-section" aria-label="실행 기록">
            <button
              type="button"
              aria-label="실행 취소"
              data-tooltip="실행 취소"
              onClick={() => canvasActions?.undo()}
            >
              <CanvasToolIcon type="undo" />
            </button>
            <button
              type="button"
              aria-label="다시 실행"
              data-tooltip="다시 실행"
              onClick={() => canvasActions?.redo()}
            >
              <CanvasToolIcon type="redo" />
            </button>
          </section>
        </nav>

        <section className="canvas-content" aria-label="Canvas board">
          <PiloTldrawCanvas
            board={visibleBoard}
            dashboard={dashboard}
            hasStoredViewSetting={hasStoredViewSetting}
            hydrationVersion={canvasHydrationVersion}
            shapeStateById={shapeStateById}
            viewSetting={viewSetting}
            onReady={setCanvasActions}
            onSelectionChange={handleSelectionChange}
            onShapesChange={persistShapeState}
            onViewChange={persistViewSetting}
          />
        </section>

        {selectedCard ? (
          <aside className="canvas-detail-panel" aria-label="Canvas detail">
            <header>
              <span>{selectedCard.kind.replace(/_/g, " ")}</span>
              <button
                type="button"
                aria-label="상세 패널 닫기"
                onClick={() => canvasActions?.clearSelection()}
              >
                x
              </button>
            </header>
            <strong>{selectedCard.title}</strong>
            <p>{selectedCard.body}</p>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{selectedCard.status}</dd>
              </div>
              <div>
                <dt>Entity</dt>
                <dd>{selectedCard.entityType}</dd>
              </div>
              <div>
                <dt>Position</dt>
                <dd>{formatPosition(selectedCard)}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatSize(selectedCard)}</dd>
              </div>
            </dl>
            <code>{selectedCard.entityId}</code>
          </aside>
        ) : null}

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
              persistViewSetting({
                ...viewSetting,
                zoom: clampZoom(viewSetting.zoom - 0.1),
              });
            }}
          >
            -
          </button>
          <strong>{Math.round(viewSetting.zoom * 100)}%</strong>
          <button
            type="button"
            aria-label="확대"
            onClick={() => {
              canvasActions?.zoomIn();
              persistViewSetting({
                ...viewSetting,
                zoom: clampZoom(viewSetting.zoom + 0.1),
              });
            }}
          >
            +
          </button>
        </div>
      </section>
    </main>
  );
}
