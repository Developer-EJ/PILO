import { Injectable } from "@nestjs/common";
import { WorkspaceCurrentMemberAdapter } from "../workspace/workspace-current-member.adapter";
import type {
  CanvasAuthUserRef,
  CanvasBoardDetail,
  CanvasBoardSummary,
  CanvasCurrentMemberContext,
  CanvasRepositoryPort,
  CanvasShapePositionRequest,
  CanvasShapeSummary,
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

export type CanvasShapePositionMutationInput = {
  shapeId: string;
  currentUser: CanvasAuthUserRef;
  body: unknown;
};

export type CanvasAccessErrorCode =
  | "canvas_board_not_found"
  | "canvas_shape_not_found"
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

export class CanvasValidationError extends Error {
  readonly code = "canvas_validation_failed";

  constructor(message: string) {
    super(message);
    this.name = "CanvasValidationError";
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

  async updateCanvasShapePosition(
    input: CanvasShapePositionMutationInput,
  ): Promise<CanvasShapeSummary> {
    const body = parseCanvasShapePositionBody(input.body);
    const workspaceId = await this.canvasRepository.findShapeWorkspaceId(
      input.shapeId,
    );

    if (!workspaceId) {
      throw new CanvasAccessError("canvas_shape_not_found", input.shapeId);
    }

    const workspaceAccess = await this.requireWorkspaceAccess({
      workspaceId,
      currentUser: input.currentUser,
    });

    if (!workspaceAccess.permissions.canWrite) {
      throw new CanvasAccessError("canvas_workspace_forbidden", workspaceId);
    }

    const shape = await this.canvasRepository.upsertShapePosition({
      shapeId: input.shapeId,
      x: body.x,
      y: body.y,
    });

    if (!shape) {
      throw new CanvasAccessError("canvas_shape_not_found", input.shapeId);
    }

    return shape;
  }

  private async requireWorkspaceAccess(
    input: CanvasWorkspaceResourceInput,
  ): Promise<CanvasCurrentMemberContext> {
    const workspaceAccess =
      await this.currentMemberAdapter.requireCurrentMember({
        workspaceId: input.workspaceId,
        currentUser: input.currentUser,
      });

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

  if (code === "canvas_shape_not_found") {
    return `Canvas shape ${resourceId} was not found.`;
  }

  return `Canvas board ${resourceId} was not found.`;
}

function parseCanvasShapePositionBody(
  body: unknown,
): CanvasShapePositionRequest {
  const record = requirePlainObject(body);

  return {
    x: parseFiniteCoordinate(record.x, "x"),
    y: parseFiniteCoordinate(record.y, "y"),
  };
}

function requirePlainObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CanvasValidationError("Canvas request body is required.");
  }

  return body as Record<string, unknown>;
}

function parseFiniteCoordinate(value: unknown, field: "x" | "y") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CanvasValidationError(
      `Canvas position ${field} must be a finite number.`,
    );
  }

  return value;
}

export type CanvasServiceRepositoryPort = CanvasRepositoryPort;
