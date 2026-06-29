import { Injectable } from "@nestjs/common";
import type { Socket } from "socket.io";
import {
  CanvasRealtimeAck,
  CanvasRealtimeAuthContext,
  parseCanvasRealtimeAuthContext,
  parseCanvasRealtimeBoardAccessList,
  parseCanvasRealtimeSessionContext,
} from "./canvas-realtime.contract";

export type CanvasRealtimeRoleRequirement = {
  minimumRole?: CanvasRealtimeAuthContext["role"];
};

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

export type CanvasRealtimeBoardAccessProviderInput = {
  client: Socket;
  boardId: string;
  currentMember: CanvasRealtimeAuthContext;
};

export abstract class CanvasRealtimeBoardAccessProvider {
  abstract resolveBoardWorkspaceId(
    input: CanvasRealtimeBoardAccessProviderInput,
  ): string | null;
}

@Injectable()
export class LocalHandshakeCanvasRealtimeBoardAccessProvider
  implements CanvasRealtimeBoardAccessProvider
{
  readonly mode = "local-handshake-insecure-fallback";

  resolveBoardWorkspaceId(input: CanvasRealtimeBoardAccessProviderInput) {
    const boardAccessList = parseCanvasRealtimeBoardAccessList(
      input.client.handshake.auth?.canvasBoards,
    );
    const boardAccess = boardAccessList.find(
      (item) => item.boardId === input.boardId,
    );

    return boardAccess?.workspaceId ?? null;
  }
}

@Injectable()
export class CanvasRealtimeAccessGuard {
  constructor(
    private readonly boardAccessProvider: CanvasRealtimeBoardAccessProvider = new LocalHandshakeCanvasRealtimeBoardAccessProvider(),
  ) {}

  requireBoardAccess(
    client: Socket,
    boardId: string,
    requirement: CanvasRealtimeRoleRequirement = {},
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

    const boardWorkspaceId = this.boardAccessProvider.resolveBoardWorkspaceId({
      client,
      boardId,
      currentMember,
    });

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

    if (
      requirement.minimumRole &&
      !hasWorkspaceRole(currentMember.role, requirement.minimumRole)
    ) {
      return deny(
        "forbidden",
        "Current member cannot mutate this canvas board.",
      );
    }

    return {
      ok: true,
      currentMember,
    };
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

const WORKSPACE_ROLE_RANK: Record<CanvasRealtimeAuthContext["role"], number> = {
  viewer: 10,
  member: 20,
  owner: 30,
};

function hasWorkspaceRole(
  role: CanvasRealtimeAuthContext["role"],
  minimumRole: CanvasRealtimeAuthContext["role"],
) {
  return WORKSPACE_ROLE_RANK[role] >= WORKSPACE_ROLE_RANK[minimumRole];
}
