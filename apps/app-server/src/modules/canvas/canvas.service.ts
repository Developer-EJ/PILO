import { Injectable } from "@nestjs/common";
import { WorkspaceCurrentMemberAdapter } from "../workspace/workspace-current-member.adapter";
import type {
  CanvasAuthUserRef,
  CanvasBoardCreateRequest,
  CanvasBoardDetail,
  CanvasBoardSummary,
  CanvasBoardType,
  CanvasConnectionDeleteResult,
  CanvasConnectionRequest,
  CanvasConnectionSummary,
  CanvasCurrentMemberContext,
  CanvasEntityType,
  CanvasFilterSetting,
  CanvasFilterSettingRequest,
  CanvasRepositoryPort,
  CanvasShapeDeleteResult,
  CanvasShapePositionRequest,
  CanvasShapeRequest,
  CanvasShapeSummary,
  CanvasShapeUpdateRequest,
  CanvasViewSetting,
  CanvasViewSettingRequest,
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

export type CanvasBoardCreateInput = {
  workspaceId: string;
  currentUser: CanvasAuthUserRef;
  body: unknown;
};

export type CanvasShapeMutationInput = {
  boardId: string;
  currentUser: CanvasAuthUserRef;
  body: unknown;
};

export type CanvasShapeUpdateInput = {
  shapeId: string;
  currentUser: CanvasAuthUserRef;
  body: unknown;
};

export type CanvasShapeDeleteInput = {
  shapeId: string;
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

export type CanvasViewSettingMutationInput = {
  boardId: string;
  currentUser: CanvasAuthUserRef;
  body: unknown;
};

export type CanvasFilterSettingMutationInput = {
  boardId: string;
  currentUser: CanvasAuthUserRef;
  body: unknown;
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

  async createCanvasBoard(
    input: CanvasBoardCreateInput,
  ): Promise<CanvasBoardSummary> {
    const body = parseCanvasBoardCreateBody(input.body);
    const workspaceAccess = await this.requireWorkspaceWriteAccess({
      workspaceId: input.workspaceId,
      currentUser: input.currentUser,
    });

    return this.canvasRepository.createBoardForWorkspace({
      workspaceId: input.workspaceId,
      createdByMemberId: workspaceAccess.currentMember.memberId,
      ...body,
    });
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

  async createCanvasShape(
    input: CanvasShapeMutationInput,
  ): Promise<CanvasShapeSummary> {
    const body = parseCanvasShapeBody(input.body);
    const workspaceAccess = await this.requireBoardWriteAccess(input);
    const shape = await this.canvasRepository.createShapeForBoard({
      boardId: input.boardId,
      createdByMemberId: workspaceAccess.currentMember.memberId,
      ...body,
    });

    if (!shape) {
      throw new CanvasAccessError("canvas_board_not_found", input.boardId);
    }

    return shape;
  }

  async updateCanvasShape(
    input: CanvasShapeUpdateInput,
  ): Promise<CanvasShapeSummary> {
    const body = parseCanvasShapeUpdateBody(input.body);
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

    const shape = await this.canvasRepository.updateShape({
      shapeId: input.shapeId,
      ...body,
    });

    if (!shape) {
      throw new CanvasAccessError("canvas_shape_not_found", input.shapeId);
    }

    return shape;
  }

  async deleteCanvasShape(
    input: CanvasShapeDeleteInput,
  ): Promise<CanvasShapeDeleteResult> {
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

    const result = await this.canvasRepository.deleteShape({
      shapeId: input.shapeId,
    });

    if (!result) {
      throw new CanvasAccessError("canvas_shape_not_found", input.shapeId);
    }

    return result;
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

  async updateCanvasViewSetting(
    input: CanvasViewSettingMutationInput,
  ): Promise<CanvasViewSetting> {
    const body = parseCanvasViewSettingBody(input.body);
    const workspaceAccess = await this.requireBoardAccess(input);
    const setting = await this.canvasRepository.upsertViewSettingForBoard({
      boardId: input.boardId,
      memberId: workspaceAccess.currentMember.memberId,
      ...body,
    });

    if (!setting) {
      throw new CanvasAccessError("canvas_board_not_found", input.boardId);
    }

    return setting;
  }

  async updateCanvasFilterSetting(
    input: CanvasFilterSettingMutationInput,
  ): Promise<CanvasFilterSetting> {
    const body = parseCanvasFilterSettingBody(input.body);
    const workspaceAccess = await this.requireBoardAccess(input);
    const setting = await this.canvasRepository.upsertFilterSettingForBoard({
      boardId: input.boardId,
      memberId: workspaceAccess.currentMember.memberId,
      ...body,
    });

    if (!setting) {
      throw new CanvasAccessError("canvas_board_not_found", input.boardId);
    }

    return setting;
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

  private async requireBoardWriteAccess(
    input: CanvasBoardResourceInput,
  ): Promise<CanvasCurrentMemberContext> {
    const workspaceAccess = await this.requireBoardAccess(input);

    if (!workspaceAccess.permissions.canWrite) {
      throw new CanvasAccessError(
        "canvas_workspace_forbidden",
        workspaceAccess.currentMember.workspaceId,
      );
    }

    return workspaceAccess;
  }

  private async requireBoardAccess(
    input: CanvasBoardResourceInput,
  ): Promise<CanvasCurrentMemberContext> {
    const workspaceId = await this.canvasRepository.findBoardWorkspaceId(
      input.boardId,
    );

    if (!workspaceId) {
      throw new CanvasAccessError("canvas_board_not_found", input.boardId);
    }

    return this.requireWorkspaceAccess({
      workspaceId,
      currentUser: input.currentUser,
    });
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

function parseCanvasBoardCreateBody(body: unknown): CanvasBoardCreateRequest {
  const record = requirePlainObject(body);

  return {
    title: parseRequiredString(record.title, "board title"),
    boardType: parseBoardType(record.boardType),
  };
}

function parseCanvasShapeBody(body: unknown): CanvasShapeRequest {
  const record = requirePlainObject(body);

  return {
    shapeType: parseCanvasEntityType(record.shapeType, "shapeType"),
    entityType: parseCanvasEntityType(record.entityType, "entityType"),
    entityId: parseUuid(record.entityId, "entityId"),
    displayTitle: parseRequiredString(record.displayTitle, "displayTitle"),
    width: parseMinimumFiniteNumber(record.width, "shape.width", 1),
    height: parseMinimumFiniteNumber(record.height, "shape.height", 1),
    color: parseRequiredString(record.color, "color"),
  };
}

function parseCanvasShapeUpdateBody(body: unknown): CanvasShapeUpdateRequest {
  const record = requirePlainObject(body);
  const update: CanvasShapeUpdateRequest = {};

  if ("displayTitle" in record) {
    update.displayTitle = parseRequiredString(
      record.displayTitle,
      "displayTitle",
    );
  }
  if ("width" in record) {
    update.width = parseMinimumFiniteNumber(record.width, "shape.width", 1);
  }
  if ("height" in record) {
    update.height = parseMinimumFiniteNumber(record.height, "shape.height", 1);
  }
  if ("color" in record) {
    update.color = parseRequiredString(record.color, "color");
  }
  if ("isCollapsed" in record) {
    update.isCollapsed = parseRequiredBoolean(
      record.isCollapsed,
      "shape.isCollapsed",
    );
  }
  if ("zIndex" in record) {
    update.zIndex = parseInteger(record.zIndex, "shape.zIndex");
  }

  if (!Object.keys(update).length) {
    throw new CanvasValidationError(
      "Canvas shape update must include at least one field.",
    );
  }

  return update;
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

function parseCanvasViewSettingBody(body: unknown): CanvasViewSettingRequest {
  const record = requirePlainObject(body);

  return {
    zoom: parseMinimumFiniteNumber(record.zoom, "viewSetting.zoom", 0.1),
    viewportX: parseFiniteNumber(record.viewportX, "viewSetting.viewportX"),
    viewportY: parseFiniteNumber(record.viewportY, "viewSetting.viewportY"),
  };
}

function parseCanvasFilterSettingBody(
  body: unknown,
): CanvasFilterSettingRequest {
  const record = requirePlainObject(body);

  return {
    enabledEntityTypes: parseEnabledEntityTypes(record.enabledEntityTypes),
    assigneeMemberId: parseNullableString(
      record.assigneeMemberId,
      "filterSetting.assigneeMemberId",
    ),
    showDelayedOnly: parseRequiredBoolean(
      record.showDelayedOnly,
      "filterSetting.showDelayedOnly",
    ),
    showRiskOnly: parseRequiredBoolean(
      record.showRiskOnly,
      "filterSetting.showRiskOnly",
    ),
    filters: parseExtensionObject(record.filters, "filterSetting.filters"),
  };
}

function parseRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CanvasValidationError(`Canvas ${field} must be a string.`);
  }

  return value.trim();
}

function parseBoardType(value: unknown): CanvasBoardType {
  if (
    value === "project_map" ||
    value === "meeting" ||
    value === "review" ||
    value === "custom"
  ) {
    return value;
  }

  throw new CanvasValidationError("Canvas boardType is not supported.");
}

function parseCanvasEntityType(
  value: unknown,
  field: "shapeType" | "entityType",
): CanvasEntityType {
  if (!isCanvasEntityType(value)) {
    throw new CanvasValidationError(`Canvas ${field} is not supported.`);
  }

  return value;
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

function parseEnabledEntityTypes(value: unknown): CanvasEntityType[] {
  if (!Array.isArray(value)) {
    throw new CanvasValidationError(
      "Canvas filterSetting.enabledEntityTypes must be an array.",
    );
  }

  const uniqueTypes = new Set<CanvasEntityType>();

  for (const entityType of value) {
    if (!isCanvasEntityType(entityType)) {
      throw new CanvasValidationError(
        "Canvas filterSetting.enabledEntityTypes contains an unsupported entity type.",
      );
    }

    uniqueTypes.add(entityType);
  }

  return Array.from(uniqueTypes);
}

function parseNullableString(value: unknown, field: string) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new CanvasValidationError(
      `Canvas ${field} must be a string or null.`,
    );
  }

  return value.trim();
}

function parseRequiredBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new CanvasValidationError(`Canvas ${field} must be a boolean.`);
  }

  return value;
}

function parseExtensionObject(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CanvasValidationError(`Canvas ${field} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function parseFiniteCoordinate(value: unknown, field: "x" | "y") {
  return parseFiniteNumber(value, `position.${field}`);
}

function parseFiniteNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CanvasValidationError(`Canvas ${field} must be a finite number.`);
  }

  return value;
}

function parseInteger(value: unknown, field: string) {
  const number = parseFiniteNumber(value, field);

  if (!Number.isInteger(number)) {
    throw new CanvasValidationError(`Canvas ${field} must be an integer.`);
  }

  return number;
}

function parseMinimumFiniteNumber(
  value: unknown,
  field: string,
  minimum: number,
) {
  const number = parseFiniteNumber(value, field);

  if (number < minimum) {
    throw new CanvasValidationError(
      `Canvas ${field} must be at least ${minimum}.`,
    );
  }

  return number;
}

function parseUuid(value: unknown, field: string) {
  const normalized = parseRequiredString(value, field);

  if (!isUuid(normalized)) {
    throw new CanvasValidationError(`Canvas ${field} must be a UUID.`);
  }

  return normalized;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isCanvasEntityType(value: unknown): value is CanvasEntityType {
  return (
    value === "task" ||
    value === "meeting_report" ||
    value === "pull_request" ||
    value === "github_issue" ||
    value === "document" ||
    value === "file" ||
    value === "code" ||
    value === "decision" ||
    value === "risk"
  );
}

export type CanvasServiceRepositoryPort = CanvasRepositoryPort;
