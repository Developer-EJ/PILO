"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  clearCanvasBoardLocalStorage,
  createCanvasClient,
} from "../../lib/workspace/canvasClient.mjs";
import { createWorkspaceDashboardFixture } from "../../lib/workspace/dashboardClient.mjs";
import {
  extractWorkspaceIdFromPathname,
  workspaceCanvasBoardHref,
} from "../../lib/workspace/currentWorkspace.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";

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

function canvasBoardTypeLabel(boardType: string) {
  if (boardType === "project_map") return "프로젝트 맵";
  if (boardType === "meeting") return "회의";
  if (boardType === "review") return "리뷰";

  return "사용자 캔버스";
}

export function WorkspaceCanvasBoards() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const workspaceId = useMemo(() => resolveWorkspaceId(pathname), [pathname]);
  const dashboard = useMemo(
    () => createWorkspaceDashboardFixture(workspaceId),
    [workspaceId],
  );
  const [state, setState] = useState<CanvasBoardListState>(
    initialBoardListState,
  );
  const [title, setTitle] = useState("프로젝트 맵");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [pendingDeleteBoardId, setPendingDeleteBoardId] = useState("");
  const [confirmDeleteBoardId, setConfirmDeleteBoardId] = useState("");
  const [deleteError, setDeleteError] = useState("");

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
    const nextTitle = title.trim() || "제목 없는 캔버스";

    setIsCreating(true);
    setCreateError("");
    setDeleteError("");

    try {
      const board = (await canvasClient.createBoard(workspaceId, {
        title: nextTitle,
        boardType: "custom",
      })) as CanvasBoardSummary;

      router.push(workspaceCanvasBoardHref(workspaceId, board.id));
    } catch (error) {
      setCreateError(
        "캔버스를 생성하지 못했어요. 서버 연결과 권한을 확인해 주세요.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function deleteBoard(board: CanvasBoardSummary) {
    if (pendingDeleteBoardId) return;

    if (confirmDeleteBoardId !== board.id) {
      setConfirmDeleteBoardId(board.id);
      setDeleteError("");
      return;
    }

    const canvasClient = createCanvasClient();

    setPendingDeleteBoardId(board.id);
    setDeleteError("");

    try {
      await canvasClient.deleteBoard(board.id, { workspaceId });
      clearCanvasBoardLocalStorage(board.id);
      setState((current) => ({
        ...current,
        boards: current.boards.filter((candidate) => candidate.id !== board.id),
      }));
      setConfirmDeleteBoardId("");
    } catch (error) {
      setDeleteError(
        "캔버스를 삭제하지 못했어요. 권한과 서버 연결을 확인해 주세요.",
      );
    } finally {
      setPendingDeleteBoardId("");
    }
  }

  return (
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
        {createError ? (
          <p className="dashboard-notice" role="alert">
            {createError}
          </p>
        ) : null}
        {deleteError ? (
          <p className="dashboard-notice" role="alert">
            {deleteError}
          </p>
        ) : null}
      </form>

      <section className="canvas-board-list" aria-label="캔버스 보드 목록">
        {state.status === "loading" ? (
          <p className="canvas-board-empty">캔버스 목록을 불러오는 중...</p>
        ) : null}

        {state.status !== "loading" && !state.boards.length ? (
          <p className="canvas-board-empty">
            아직 캔버스가 없어요. 새 캔버스를 만들어 시작하세요.
          </p>
        ) : null}

        {state.boards.map((board) => {
          const isConfirmingDelete = confirmDeleteBoardId === board.id;
          const isDeleting = pendingDeleteBoardId === board.id;

          return (
            <article className="canvas-board-card" key={board.id}>
              <Link
                href={workspaceCanvasBoardHref(workspaceId, board.id)}
                className="canvas-board-card-link"
              >
                <span>{canvasBoardTypeLabel(board.boardType)}</span>
                <strong>{board.title}</strong>
                <small>
                  노드 {board.shapeCount}개 · 연결 {board.connectionCount}개
                </small>
                <time dateTime={board.updatedAt}>
                  {formatUpdatedAt(board.updatedAt)}
                </time>
              </Link>
              <button
                type="button"
                className={
                  isConfirmingDelete
                    ? "canvas-board-delete-button is-confirming"
                    : "canvas-board-delete-button"
                }
                disabled={Boolean(pendingDeleteBoardId)}
                onClick={() => void deleteBoard(board)}
              >
                {isDeleting
                  ? "삭제 중"
                  : isConfirmingDelete
                    ? "삭제 확인"
                    : "삭제"}
              </button>
            </article>
          );
        })}
      </section>
    </section>
  );
}
