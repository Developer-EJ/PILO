"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthSession } from "@/features/auth";
import { isDevPreviewAccessToken } from "@/features/auth/session-storage";
import {
  createCanvasClient,
  createMockCanvasBoardDetail,
  resolveCanvasClientMode,
} from "@/features/canvas/api/canvas-client";
import type { CanvasRealtimeConfig } from "@/shared/canvas-realtime/canvas-realtime-types";
import type { CanvasBoardDetail } from "@/features/canvas/engine/runtime/ClassicCanvasRuntime";
import {
  shouldReuseLoadedCanvasBoard,
  type LoadedCanvasBoardIdentity,
} from "./canvas-board-load-policy";

type CanvasBoardState = {
  board: CanvasBoardDetail | null;
  source: "mock" | "api";
  status: "loading" | "ready" | "fallback";
};

const MOCK_CANVAS_WORKSPACE_ID = "pilo-local-workspace";

function resolveCanvasWorkspaceId(
  canvasClientMode: CanvasBoardState["source"],
  authWorkspaceId: string | undefined,
) {
  if (authWorkspaceId) {
    return authWorkspaceId;
  }

  return canvasClientMode === "mock" ? MOCK_CANVAS_WORKSPACE_ID : "";
}

export function useWorkspaceCanvasBoard(boardId?: string) {
  const authSession = useAuthSession();
  const loadedBoardIdentityRef = useRef<LoadedCanvasBoardIdentity | null>(null);
  const [boardState, setBoardState] = useState<CanvasBoardState>({
    board: null,
    source: "mock",
    status: "loading",
  });
  const canvasClientMode = resolveCanvasClientMode();
  const canvasClient = useMemo(
    () =>
      createCanvasClient({
        authToken: authSession?.accessToken ?? null,
        mode: canvasClientMode,
      }),
    [authSession?.accessToken, canvasClientMode],
  );
  const workspaceId = resolveCanvasWorkspaceId(
    canvasClientMode,
    authSession?.activeWorkspaceId,
  );
  const fallbackBoard = useMemo(
    () =>
      createMockCanvasBoardDetail(
        workspaceId || MOCK_CANVAS_WORKSPACE_ID,
      ) as CanvasBoardDetail,
    [workspaceId],
  );
  const activeBoard =
    boardState.board &&
    boardState.board.workspaceId === workspaceId &&
    (!boardId || boardState.board.id === boardId)
      ? boardState.board
      : null;
  const board = activeBoard ?? fallbackBoard;
  const shouldUseCanvasApi =
    boardState.source === "api" &&
    boardState.status === "ready" &&
    activeBoard !== null;
  const canvasRealtimeConfig = useMemo<CanvasRealtimeConfig>(
    () => ({
      enabled: Boolean(
        shouldUseCanvasApi &&
          authSession?.accessToken &&
          !isDevPreviewAccessToken(authSession.accessToken) &&
          authSession.user.id &&
          workspaceId &&
          board.id,
      ),
      workspaceId,
      canvasId: board.id,
      authToken: authSession?.accessToken ?? null,
      currentUser: authSession
        ? {
            userId: authSession.user.id,
            displayName:
              authSession.user.name ?? authSession.user.email ?? "PILO",
            avatarUrl: authSession.user.avatarUrl,
          }
        : null,
    }),
    [authSession, board.id, shouldUseCanvasApi, workspaceId],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCanvasBoard() {
      if (
        shouldReuseLoadedCanvasBoard({
          client: canvasClient,
          loadedBoard: loadedBoardIdentityRef.current,
          requestedBoardId: boardId,
          workspaceId,
        })
      ) {
        return;
      }

      loadedBoardIdentityRef.current = null;

      if (!workspaceId) {
        setBoardState({
          board: null,
          source: canvasClientMode,
          status: "loading",
        });
        return;
      }

      setBoardState({
        board: null,
        source: canvasClientMode,
        status: "loading",
      });

      try {
        const boards = await canvasClient.listBoards(workspaceId);
        let targetBoardId = boardId ?? boards[0]?.id;

        if (!targetBoardId) {
          const createdBoard = await canvasClient.createBoard(workspaceId, {
            title: "PILO Canvas",
          });

          targetBoardId =
            typeof createdBoard === "object" &&
            createdBoard !== null &&
            "id" in createdBoard &&
            typeof createdBoard.id === "string"
              ? createdBoard.id
              : fallbackBoard.id;
        }

        const detail = (await canvasClient.getBoardDetail(targetBoardId, {
          workspaceId,
        })) as CanvasBoardDetail;

        if (cancelled) return;

        loadedBoardIdentityRef.current = {
          boardId: detail.id,
          client: canvasClient,
          workspaceId: detail.workspaceId,
        };
        setBoardState({
          board: detail,
          source: canvasClientMode,
          status: "ready",
        });
      } catch {
        if (cancelled) return;

        setBoardState({
          board: fallbackBoard,
          source: canvasClientMode,
          status: "fallback",
        });
      }
    }

    void loadCanvasBoard();

    return () => {
      cancelled = true;
    };
  }, [boardId, canvasClient, canvasClientMode, fallbackBoard, workspaceId]);

  return {
    authSession,
    board,
    canvasClient,
    canvasRealtimeConfig,
    shouldUseCanvasApi,
    workspaceId,
  };
}
