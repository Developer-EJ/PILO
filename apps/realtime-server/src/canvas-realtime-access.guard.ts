import { Injectable } from "@nestjs/common";
import type { Socket } from "socket.io";
import {
  CanvasRealtimeAck,
  CanvasRealtimeAuthContext,
  parseCanvasRealtimeAuthContext,
  parseCanvasRealtimeBoardAccessList,
  parseCanvasRealtimeSessionContext,
} from "./canvas-realtime.contract";

export type CanvasRealtimeBoardAccessResult =
  | {
      ok: true;
      currentMember: CanvasRealtimeAuthContext;
    }
  | {
      ok: false;
      error: Exclude<CanvasRealtimeAck & { ok: false }, { ok: true }>["error"];
      message: string;
    };

@Injectable()
export class CanvasRealtimeAccessGuard {
  requireBoardAccess(
    client: Socket,
    boardId: string,
    now = new Date(),
  ): CanvasRealtimeBoardAccessResult {
    const session = parseCanvasRealtimeSessionContext(
      client.handshake.auth?.session,
    );
    const currentMember = parseCanvasRealtimeAuthContext(
      client.handshake.auth?.currentMember,
    );

    if (!session || !currentMember) {
      return deny(
        "auth_required",
        "Canvas realtime session and currentMember context are required.",
      );
    }

    if (session.userId !== currentMember.userId) {
      return deny(
        "auth_required",
        "Canvas realtime session and currentMember must reference the same user.",
      );
    }

    if (isSessionExpired(session.expiresAt, now)) {
      return deny("auth_expired", "Canvas realtime session is expired.");
    }

    const boardWorkspaceId = this.resolveBoardWorkspaceId(client, boardId);

    if (!boardWorkspaceId) {
      return deny(
        "board_not_found",
        "Canvas board access context was not found.",
      );
    }

    if (boardWorkspaceId !== currentMember.workspaceId) {
      return deny(
        "forbidden",
        "Current member cannot join a canvas board outside their workspace.",
      );
    }

    return {
      ok: true,
      currentMember,
    };
  }

  private resolveBoardWorkspaceId(client: Socket, boardId: string) {
    const boardAccessList = parseCanvasRealtimeBoardAccessList(
      client.handshake.auth?.canvasBoards,
    );
    const boardAccess = boardAccessList.find(
      (item) => item.boardId === boardId,
    );

    return boardAccess?.workspaceId ?? null;
  }
}

function deny(
  error: Exclude<CanvasRealtimeAck & { ok: false }, { ok: true }>["error"],
  message: string,
): CanvasRealtimeBoardAccessResult {
  return {
    ok: false,
    error,
    message,
  };
}

function isSessionExpired(expiresAt: string | null, now: Date) {
  if (!expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);

  return Number.isNaN(expiresAtMs) || expiresAtMs <= now.getTime();
}
