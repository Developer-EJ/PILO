"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CurrentUserAvatar } from "../auth/CurrentUserAvatar";
import { LogoutButton } from "../auth/LogoutButton";
import { createCanvasClient } from "../../lib/workspace/canvasClient.mjs";
import { createWorkspaceDashboardFixture } from "../../lib/workspace/dashboardClient.mjs";
import {
  buildWorkspaceFeatureTabs,
  extractWorkspaceIdFromPathname,
  workspaceCanvasBoardHref,
} from "../../lib/workspace/currentWorkspace.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";
import { CurrentWorkspaceSwitcher } from "./CurrentWorkspaceSwitcher";

type CanvasBoardSummary = {
  id: string;
  workspaceId: string;
  title: string;
  boardType: string;
  shapeCount: number;
  connectionCount: number;
  updatedAt: string;
};

type CanvasBoardListState =
  | { status: "loading"; boards: CanvasBoardSummary[]; warning: null }
  | { status: "ready"; boards: CanvasBoardSummary[]; warning: null }
  | { status: "fallback"; boards: CanvasBoardSummary[]; warning: string };

const initialBoardListState: CanvasBoardListState = {
  status: "loading",
  boards: [],
  warning: null,
};

function resolveWorkspaceId(pathname: string) {
  return extractWorkspaceIdFromPathname(pathname) ?? mockWorkspaces[0].id;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "방금 전";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function WorkspaceCanvasBoards() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const workspaceId = useMemo(() => resolveWorkspaceId(pathname), [pathname]);
  const dashboard = useMemo(
    () => createWorkspaceDashboardFixture(workspaceId),
    [workspaceId],
  );
  const navItems = useMemo(
    () =>
      buildWorkspaceFeatureTabs(workspaceId, {
        active: "canvas",
        badges: {
          tasks: dashboard.tasks.length,
          meetings: dashboard.meetingReports.length || undefined,
          github: dashboard.pullRequests.length || undefined,
          reviews: dashboard.pullRequests.length || undefined,
        },
      }),
    [
      dashboard.meetingReports.length,
      dashboard.pullRequests.length,
      dashboard.tasks.length,
      workspaceId,
    ],
  );
  const [state, setState] = useState<CanvasBoardListState>(
    initialBoardListState,
  );
  const [title, setTitle] = useState("Project Map");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvasClient = createCanvasClient();

    async function loadBoards() {
      setState(initialBoardListState);

      try {
        const boards = (await canvasClient.listBoards(
          workspaceId,
        )) as CanvasBoardSummary[];

        if (cancelled) return;

        setState({
          status: "ready",
          boards,
          warning: null,
        });
      } catch (error) {
        if (cancelled) return;

        setState({
          status: "fallback",
          boards: [],
          warning: "캔버스 목록을 불러오지 못했어요.",
        });
      }
    }

    void loadBoards();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function createBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isCreating) return;

    const canvasClient = createCanvasClient();
    const nextTitle = title.trim() || "Untitled canvas";

    setIsCreating(true);

    try {
      const board = (await canvasClient.createBoard(workspaceId, {
        title: nextTitle,
        boardType: "freeform",
      })) as CanvasBoardSummary;

      router.push(workspaceCanvasBoardHref(workspaceId, board.id));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="dashboard-shell canvas-board-index-shell">
      <aside className="sidebar" aria-label="PILO navigation">
        <div className="brand">
          <CurrentWorkspaceSwitcher />
        </div>
        <nav className="nav-list" aria-label="Workspace navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.active ? "nav-item active" : "nav-item"}
              aria-current={item.active ? "page" : undefined}
            >
              <span>{item.label}</span>
              {item.badge ? <b>{item.badge}</b> : null}
            </Link>
          ))}
        </nav>
      </aside>

      <section className="workspace canvas-board-index-workspace">
        <header className="topbar">
          <div>
            <small>CANVAS</small>
            <h1>캔버스 보드</h1>
          </div>
          <div className="topbar-actions">
            <LogoutButton />
            <CurrentUserAvatar />
          </div>
        </header>

        <section className="canvas-board-index-content">
          <div className="canvas-board-index-heading">
            <div>
              <span>{dashboard.workspace.name}</span>
              <h2>작업할 캔버스를 선택하세요</h2>
            </div>
            {state.warning ? <p>{state.warning}</p> : null}
          </div>

          <form className="canvas-board-create-panel" onSubmit={createBoard}>
            <label htmlFor="canvas-board-title">새 캔버스</label>
            <div>
              <input
                id="canvas-board-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="캔버스 이름"
              />
              <button type="submit" disabled={isCreating}>
                {isCreating ? "생성 중" : "생성"}
              </button>
            </div>
          </form>

          <section className="canvas-board-list" aria-label="Canvas boards">
            {state.status === "loading" ? (
              <p className="canvas-board-empty">캔버스 목록을 불러오는 중...</p>
            ) : null}

            {state.status !== "loading" && !state.boards.length ? (
              <p className="canvas-board-empty">
                아직 캔버스가 없어요. 새 캔버스를 만들어 시작하세요.
              </p>
            ) : null}

            {state.boards.map((board) => (
              <Link
                key={board.id}
                href={workspaceCanvasBoardHref(workspaceId, board.id)}
                className="canvas-board-card"
              >
                <span>{board.boardType.replace(/_/g, " ")}</span>
                <strong>{board.title}</strong>
                <small>
                  노드 {board.shapeCount}개 · 연결 {board.connectionCount}개
                </small>
                <time dateTime={board.updatedAt}>
                  {formatUpdatedAt(board.updatedAt)}
                </time>
              </Link>
            ))}
          </section>
        </section>
      </section>
    </main>
  );
}
