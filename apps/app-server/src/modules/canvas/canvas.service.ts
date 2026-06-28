import { Injectable } from "@nestjs/common";
import { WorkspaceCurrentMemberAdapter } from "../workspace/workspace-current-member.adapter";
import type {
  CanvasAuthUserRef,
  CanvasBoardDetail,
  CanvasBoardSummary,
  CanvasConnectionDeleteResult,
  CanvasConnectionRequest,
  CanvasConnectionSummary,
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

export type CanvasConnectionMutationInput = {
  boardId: string;
  currentUser: CanvasAuthUserRef;
  body: unknown;
};

export type CanvasConnectionDeleteInput = {
  connectionId: string;
  currentUser: CanvasAuthUserRef;
};

export type CanvasShapePositionMutationInput = {
  shapeId: string;
  currentUser: CanvasAuthUserRef;
  body: unknown;
};

export type CanvasAccessErrorCode =
  | "canvas_board_not_found"
  | "canvas_connection_not_found"
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

export class CanvasConflictError extends Error {
  readonly code = "canvas_connection_duplicate";

  constructor(message: string) {
    super(message);
    this.name = "CanvasConflictError";
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

  async createCanvasConnection(
    input: CanvasConnectionMutationInput,
  ): Promise<CanvasConnectionSummary> {
    const body = parseCanvasConnectionBody(input.body);
    const workspaceId = await this.canvasRepository.findBoardWorkspaceId(
      input.boardId,
    );

    if (!workspaceId) {
      throw new CanvasAccessError("canvas_board_not_found", input.boardId);
    }

    await this.requireWorkspaceWriteAccess({
      workspaceId,
      currentUser: input.currentUser,
    });

    const result = await this.canvasRepository.createConnectionForBoard({
      boardId: input.boardId,
      ...body,
    });

    if (result.status === "duplicate") {
      throw new CanvasConflictError(
        "Canvas connection already exists for source, target, and type.",
      );
    }

    if (result.status === "invalid") {
      throw new CanvasValidationError(
        "Canvas connection shapes must exist in the same board and be different shapes.",
      );
    }

    return result.connection;
  }

  async deleteCanvasConnection(
    input: CanvasConnectionDeleteInput,
  ): Promise<CanvasConnectionDeleteResult> {
    const workspaceId = await this.canvasRepository.findConnectionWorkspaceId(
      input.connectionId,
    );

    if (!workspaceId) {
      throw new CanvasAccessError(
        "canvas_connection_not_found",
        input.connectionId,
      );
    }

    await this.requireWorkspaceWriteAccess({
      workspaceId,
      currentUser: input.currentUser,
    });

    const result = await this.canvasRepository.deleteConnection({
      connectionId: input.connectionId,
    });

    if (!result) {
      throw new CanvasAccessError(
        "canvas_connection_not_found",
        input.connectionId,
      );
    }

    return result;
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

    await this.requireWorkspaceWriteAccess({
      workspaceId,
      currentUser: input.currentUser,
    });

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

  private async requireWorkspaceWriteAccess(
    input: CanvasWorkspaceResourceInput,
  ): Promise<CanvasCurrentMemberContext> {
    const workspaceAccess = await this.requireWorkspaceAccess(input);

    if (!workspaceAccess.permissions.canWrite) {
      throw new CanvasAccessError(
        "canvas_workspace_forbidden",
        input.workspaceId,
      );
    }

    return workspaceAccess;
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

  if (code === "canvas_connection_not_found") {
    return `Canvas connection ${resourceId} was not found.`;
  }

  return `Canvas board ${resourceId} was not found.`;
}

function parseCanvasConnectionBody(body: unknown): CanvasConnectionRequest {
  const record = requirePlainObject(body);

  return {
    sourceShapeId: parseRequiredString(record.sourceShapeId, "sourceShapeId"),
    targetShapeId: parseRequiredString(record.targetShapeId, "targetShapeId"),
    connectionType: parseRequiredString(
      record.connectionType,
      "connectionType",
    ),
    label: parseNullableLabel(record),
  };
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

function parseRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CanvasValidationError(`Canvas ${field} must be a string.`);
  }

  return value.trim();
}

function parseNullableLabel(record: Record<string, unknown>) {
  if (!("label" in record)) {
    throw new CanvasValidationError("Canvas connection label is required.");
  }

  if (record.label === null) {
    return null;
  }

  if (typeof record.label !== "string") {
    throw new CanvasValidationError(
      "Canvas connection label must be a string or null.",
    );
  }

  const label = record.label.trim();

  return label ? label : null;
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
