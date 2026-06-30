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
import { WorkspaceSidebar } from "./WorkspaceSidebar";

type CanvasBoardSummary = {
  id: string;
  workspaceId: string;
  title: string;
  boardType: string;
  shapeCount: number;
  connectionCount: number;
  updatedAt: string;
};

type CanvasBoardListState = {
  status: "loading" | "ready" | "error";
  boards: CanvasBoardSummary[];
  warning: string | null;
};

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

  if (Number.isNaN(date.getTime())) return "Just now";

  return new Intl.DateTimeFormat("en-US", {
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
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvasClient = createCanvasClient();

    async function loadBoards() {
      setState(initialBoardListState);
      setCreateError(null);

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
          status: "error",
          boards: [],
          warning: "Canvas board list could not be loaded from the API.",
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
    setCreateError(null);

    try {
      const board = (await canvasClient.createBoard(workspaceId, {
        title: nextTitle,
        boardType: "freeform",
      })) as CanvasBoardSummary;

      router.push(workspaceCanvasBoardHref(workspaceId, board.id));
    } catch (error) {
      setCreateError("Canvas board could not be created.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="dashboard-shell canvas-board-index-shell">
      <WorkspaceSidebar items={navItems} />

      <section className="workspace canvas-board-index-workspace">
        <header className="topbar">
          <div>
            <small>CANVAS</small>
            <h1>Canvas boards</h1>
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
              <h2>Select a workspace canvas</h2>
            </div>
            {state.warning ? <p>{state.warning}</p> : null}
            {createError ? <p>{createError}</p> : null}
          </div>

          <form className="canvas-board-create-panel" onSubmit={createBoard}>
            <label htmlFor="canvas-board-title">New canvas</label>
            <div>
              <input
                id="canvas-board-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Canvas name"
              />
              <button type="submit" disabled={isCreating}>
                {isCreating ? "Creating" : "Create"}
              </button>
            </div>
          </form>

          <section className="canvas-board-list" aria-label="Canvas boards">
            {state.status === "loading" ? (
              <p className="canvas-board-empty">Loading canvas boards.</p>
            ) : null}

            {state.status !== "loading" && !state.boards.length ? (
              <p className="canvas-board-empty">
                No canvas boards yet. Create a canvas to begin.
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
                  Nodes {board.shapeCount} / Connections{" "}
                  {board.connectionCount}
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
