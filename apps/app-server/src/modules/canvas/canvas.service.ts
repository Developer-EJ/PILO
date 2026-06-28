import { Injectable } from "@nestjs/common";
import { WorkspaceCurrentMemberAdapter } from "../workspace/workspace-current-member.adapter";
import type {
  CanvasAuthUserRef,
  CanvasBoardDetail,
  CanvasBoardSummary,
  CanvasCurrentMemberContext,
  CanvasRepositoryPort,
} from "./canvas.types";
import { CanvasRepository } from "./canvas.repository";

export type CanvasWorkspaceResourceInput = {
  workspaceId: string;
  currentUser: CanvasAuthUserRef;
};

export type CanvasBoardResourceInput = {
  boardId: string;
  currentUser: CanvasAuthUserRef;
};

export type CanvasAccessErrorCode =
  | "canvas_board_not_found"
  | "canvas_workspace_forbidden";

export class CanvasAccessError extends Error {
  constructor(
    readonly code: CanvasAccessErrorCode,
    readonly resourceId: string,
  ) {
    super(createCanvasAccessErrorMessage(code, resourceId));
    this.name = "CanvasAccessError";
  }
}

@Injectable()
export class CanvasService {
  constructor(
    private readonly canvasRepository: CanvasRepository,
    private readonly currentMemberAdapter: WorkspaceCurrentMemberAdapter,
  ) {}

  getRepositoryStatus() {
    return {
      storageMode: this.canvasRepository.storageMode,
    };
  }

  async listCanvasBoards(
    input: CanvasWorkspaceResourceInput,
  ): Promise<CanvasBoardSummary[]> {
    await this.requireWorkspaceAccess(input);

    return this.canvasRepository.listBoardsForWorkspace(input.workspaceId);
  }

  async getCanvasBoardDetail(
    input: CanvasBoardResourceInput,
  ): Promise<CanvasBoardDetail> {
    const workspaceId = await this.canvasRepository.findBoardWorkspaceId(
      input.boardId,
    );

    if (!workspaceId) {
      throw new CanvasAccessError("canvas_board_not_found", input.boardId);
    }

    const workspaceAccess = await this.requireWorkspaceAccess({
      workspaceId,
      currentUser: input.currentUser,
    });
    const board = await this.canvasRepository.findBoardDetail({
      boardId: input.boardId,
      memberId: workspaceAccess.currentMember.memberId,
    });

    if (!board) {
      throw new CanvasAccessError("canvas_board_not_found", input.boardId);
    }

    return board;
  }

  private async requireWorkspaceAccess(
    input: CanvasWorkspaceResourceInput,
  ): Promise<CanvasCurrentMemberContext> {
    const workspaceAccess = await this.currentMemberAdapter.requireCurrentMember(
      {
        workspaceId: input.workspaceId,
        currentUser: input.currentUser,
      },
    );

    if (!workspaceAccess.permissions.canRead) {
      throw new CanvasAccessError(
        "canvas_workspace_forbidden",
        input.workspaceId,
      );
    }

    return workspaceAccess;
  }
}

function createCanvasAccessErrorMessage(
  code: CanvasAccessErrorCode,
  resourceId: string,
) {
  if (code === "canvas_workspace_forbidden") {
    return `Current member cannot access canvas workspace ${resourceId}.`;
  }

  return `Canvas board ${resourceId} was not found.`;
}

export type CanvasServiceRepositoryPort = CanvasRepositoryPort;
