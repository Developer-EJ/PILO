import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  CanvasBoardDetail,
  CanvasBoardCreateRequest,
  CanvasBoardDeleteResult,
  CanvasBoardRecord,
  CanvasBoardSummary,
  CanvasConnectionCreateResult,
  CanvasConnectionDeleteResult,
  CanvasConnectionRequest,
  CanvasConnectionRecord,
  CanvasConnectionSummary,
  CanvasConnectionType,
  CanvasFilterSetting,
  CanvasFilterSettingRequest,
  CanvasFilterSettingRecord,
  CanvasNodePositionRecord,
  CanvasRepositoryPort,
  CanvasShapeDeleteResult,
  CanvasShapeRecord,
  CanvasShapeRequest,
  CanvasShapeSummary,
  CanvasShapeUpdateRequest,
  CanvasViewSetting,
  CanvasViewSettingRequest,
  CanvasViewSettingRecord,
} from "./canvas.types";

@Injectable()
export class CanvasRepository implements CanvasRepositoryPort {
  readonly storageMode = "memory";

  private readonly boardsById = new Map<string, CanvasBoardRecord>();
  private readonly shapesById = new Map<string, CanvasShapeRecord>();
  private readonly positionsByShapeId = new Map<
    string,
    CanvasNodePositionRecord
  >();
  private readonly connectionsById = new Map<string, CanvasConnectionRecord>();
  private readonly viewSettingsByKey = new Map<
    string,
    CanvasViewSettingRecord
  >();
  private readonly filterSettingsByKey = new Map<
    string,
    CanvasFilterSettingRecord
  >();

  async listBoardsForWorkspace(
    workspaceId: string,
  ): Promise<CanvasBoardSummary[]> {
    return Array.from(this.boardsById.values())
      .filter((board) => board.workspaceId === workspaceId && !board.deletedAt)
      .map((board) => this.toBoardSummary(board))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async findBoardWorkspaceId(boardId: string): Promise<string | null> {
    const board = this.findVisibleBoard(boardId);

    return board?.workspaceId ?? null;
  }

  async findShapeWorkspaceId(shapeId: string): Promise<string | null> {
    const shape = this.findVisibleShape(shapeId);

    if (!shape) {
      return null;
    }

    const board = this.findVisibleBoard(shape.boardId);

    return board?.workspaceId ?? null;
  }

  async createBoardForWorkspace(
    input: CanvasBoardCreateRequest & {
      workspaceId: string;
      createdByMemberId: string;
      now?: Date;
    },
  ): Promise<CanvasBoardSummary> {
    const now = (input.now ?? new Date()).toISOString();
    const board: CanvasBoardRecord = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      title: input.title,
      boardType: input.boardType,
      createdByMemberId: input.createdByMemberId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    this.boardsById.set(board.id, board);

    return this.toBoardSummary(board);
  }

  async deleteBoard(input: {
    boardId: string;
    now?: Date;
  }): Promise<CanvasBoardDeleteResult | null> {
    const board = this.findVisibleBoard(input.boardId);

    if (!board) {
      return null;
    }

    const now = (input.now ?? new Date()).toISOString();
    board.deletedAt = now;
    board.updatedAt = now;

    for (const shape of this.shapesById.values()) {
      if (shape.boardId === board.id && !shape.deletedAt) {
        shape.deletedAt = now;
        shape.updatedAt = now;
      }
    }

    for (const connection of this.connectionsById.values()) {
      if (connection.boardId === board.id && !connection.deletedAt) {
        connection.deletedAt = now;
        connection.updatedAt = now;
      }
    }

    return {
      id: board.id,
      deleted: true,
    };
  }

  async findConnectionWorkspaceId(
    connectionId: string,
  ): Promise<string | null> {
    const connection = this.findVisibleConnection(connectionId);

    if (!connection) {
      return null;
    }

    const board = this.findVisibleBoard(connection.boardId);

    return board?.workspaceId ?? null;
  }

  async findBoardDetail(input: {
    boardId: string;
    memberId: string;
  }): Promise<CanvasBoardDetail | null> {
    const board = this.findVisibleBoard(input.boardId);

    if (!board) {
      return null;
    }

    const shapes = this.listVisibleShapes(input.boardId);
    const connections = this.listVisibleConnections(input.boardId);

    return {
      ...this.toBoardSummary(board),
      shapes: shapes.map((shape) => this.toShapeSummary(shape)),
      connections: connections.map((connection) =>
        this.toConnectionSummary(connection),
      ),
      viewSetting: this.toViewSetting(input.boardId, input.memberId),
      filterSetting: this.toFilterSetting(input.boardId, input.memberId),
    };
  }

  async createShapeForBoard(
    input: CanvasShapeRequest & {
      boardId: string;
      createdByMemberId: string;
      now?: Date;
    },
  ): Promise<CanvasShapeSummary | null> {
    const board = this.findVisibleBoard(input.boardId);

    if (!board) {
      return null;
    }

    const now = (input.now ?? new Date()).toISOString();
    const zIndex = this.listVisibleShapes(input.boardId).length + 1;
    const shape: CanvasShapeRecord = {
      id: randomUUID(),
      boardId: input.boardId,
      shapeType: input.shapeType,
      entityType: input.entityType,
      entityId: input.entityId,
      displayTitle: input.displayTitle,
      width: input.width,
      height: input.height,
      color: input.color,
      isCollapsed: false,
      zIndex,
      createdByMemberId: input.createdByMemberId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    this.shapesById.set(shape.id, shape);
    board.updatedAt = now;

    return this.toShapeSummary(shape);
  }

  async updateShape(
    input: CanvasShapeUpdateRequest & {
      shapeId: string;
      now?: Date;
    },
  ): Promise<CanvasShapeSummary | null> {
    const shape = this.findVisibleShape(input.shapeId);

    if (!shape) {
      return null;
    }

    if (input.displayTitle !== undefined)
      shape.displayTitle = input.displayTitle;
    if (input.width !== undefined) shape.width = input.width;
    if (input.height !== undefined) shape.height = input.height;
    if (input.color !== undefined) shape.color = input.color;
    if (input.isCollapsed !== undefined) shape.isCollapsed = input.isCollapsed;
    if (input.zIndex !== undefined) shape.zIndex = input.zIndex;

    const updatedAt = (input.now ?? new Date()).toISOString();
    shape.updatedAt = updatedAt;

    const board = this.findVisibleBoard(shape.boardId);

    if (board) {
      board.updatedAt = updatedAt;
    }

    return this.toShapeSummary(shape);
  }

  async deleteShape(input: {
    shapeId: string;
    now?: Date;
  }): Promise<CanvasShapeDeleteResult | null> {
    const shape = this.findVisibleShape(input.shapeId);

    if (!shape) {
      return null;
    }

    const now = (input.now ?? new Date()).toISOString();
    shape.deletedAt = now;
    shape.updatedAt = now;

    for (const connection of this.connectionsById.values()) {
      if (
        !connection.deletedAt &&
        (connection.sourceShapeId === shape.id ||
          connection.targetShapeId === shape.id)
      ) {
        connection.deletedAt = now;
        connection.updatedAt = now;
      }
    }

    const board = this.findVisibleBoard(shape.boardId);

    if (board) {
      board.updatedAt = now;
    }

    return {
      id: shape.id,
      deleted: true,
    };
  }

  async upsertShapePosition(input: {
    shapeId: string;
    x: number;
    y: number;
    now?: Date;
  }): Promise<CanvasShapeSummary | null> {
    const shape = this.findVisibleShape(input.shapeId);

    if (!shape) {
      return null;
    }

    const updatedAt = (input.now ?? new Date()).toISOString();
    this.positionsByShapeId.set(input.shapeId, {
      shapeId: input.shapeId,
      x: input.x,
      y: input.y,
      updatedAt,
    });

    const board = this.findVisibleBoard(shape.boardId);

    if (board) {
      board.updatedAt = updatedAt;
    }

    return this.toShapeSummary(shape);
  }

  async createConnectionForBoard(
    input: CanvasConnectionRequest & {
      boardId: string;
      now?: Date;
    },
  ): Promise<CanvasConnectionCreateResult> {
    const board = this.findVisibleBoard(input.boardId);
    const sourceShape = this.findVisibleShape(input.sourceShapeId);
    const targetShape = this.findVisibleShape(input.targetShapeId);

    if (
      !board ||
      !sourceShape ||
      !targetShape ||
      sourceShape.boardId !== input.boardId ||
      targetShape.boardId !== input.boardId ||
      input.sourceShapeId === input.targetShapeId
    ) {
      return {
        status: "invalid",
      };
    }

    const duplicate = this.findDuplicateVisibleConnection({
      boardId: input.boardId,
      sourceShapeId: input.sourceShapeId,
      targetShapeId: input.targetShapeId,
      connectionType: input.connectionType,
    });

    if (duplicate) {
      return {
        status: "duplicate",
      };
    }

    const now = (input.now ?? new Date()).toISOString();
    const connection: CanvasConnectionRecord = {
      id: randomUUID(),
      boardId: input.boardId,
      sourceShapeId: input.sourceShapeId,
      targetShapeId: input.targetShapeId,
      connectionType: input.connectionType,
      label: input.label,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    this.connectionsById.set(connection.id, connection);
    board.updatedAt = now;

    return {
      status: "created",
      connection: this.toConnectionSummary(connection),
    };
  }

  async deleteConnection(input: {
    connectionId: string;
    now?: Date;
  }): Promise<CanvasConnectionDeleteResult | null> {
    const connection = this.findVisibleConnection(input.connectionId);

    if (!connection) {
      return null;
    }

    const now = (input.now ?? new Date()).toISOString();
    connection.deletedAt = now;
    connection.updatedAt = now;

    const board = this.findVisibleBoard(connection.boardId);

    if (board) {
      board.updatedAt = now;
    }

    return {
      id: connection.id,
      deleted: true,
    };
  }

  async upsertViewSettingForBoard(
    input: CanvasViewSettingRequest & {
      boardId: string;
      memberId: string;
      now?: Date;
    },
  ): Promise<CanvasViewSetting | null> {
    const board = this.findVisibleBoard(input.boardId);

    if (!board) {
      return null;
    }

    const updatedAt = (input.now ?? new Date()).toISOString();
    this.viewSettingsByKey.set(
      createMemberSettingKey(input.boardId, input.memberId),
      {
        boardId: input.boardId,
        memberId: input.memberId,
        zoom: input.zoom,
        viewportX: input.viewportX,
        viewportY: input.viewportY,
        updatedAt,
      },
    );
    board.updatedAt = updatedAt;

    return this.toViewSetting(input.boardId, input.memberId);
  }

  async upsertFilterSettingForBoard(
    input: CanvasFilterSettingRequest & {
      boardId: string;
      memberId: string;
      now?: Date;
    },
  ): Promise<CanvasFilterSetting | null> {
    const board = this.findVisibleBoard(input.boardId);

    if (!board) {
      return null;
    }

    const updatedAt = (input.now ?? new Date()).toISOString();
    this.filterSettingsByKey.set(
      createMemberSettingKey(input.boardId, input.memberId),
      {
        boardId: input.boardId,
        memberId: input.memberId,
        enabledEntityTypes: [...input.enabledEntityTypes],
        assigneeMemberId: input.assigneeMemberId,
        showDelayedOnly: input.showDelayedOnly,
        showRiskOnly: input.showRiskOnly,
        filters: { ...input.filters },
        updatedAt,
      },
    );
    board.updatedAt = updatedAt;

    return this.toFilterSetting(input.boardId, input.memberId);
  }

  private findVisibleBoard(boardId: string) {
    const board = this.boardsById.get(boardId);

    if (!board || board.deletedAt) {
      return null;
    }

    return board;
  }

  private findVisibleShape(shapeId: string) {
    const shape = this.shapesById.get(shapeId);

    if (!shape || shape.deletedAt) {
      return null;
    }

    return shape;
  }

  private findVisibleConnection(connectionId: string) {
    const connection = this.connectionsById.get(connectionId);

    if (!connection || connection.deletedAt) {
      return null;
    }

    return connection;
  }

  private findDuplicateVisibleConnection(input: {
    boardId: string;
    sourceShapeId: string;
    targetShapeId: string;
    connectionType: CanvasConnectionType;
  }) {
    return Array.from(this.connectionsById.values()).find(
      (connection) =>
        connection.boardId === input.boardId &&
        connection.sourceShapeId === input.sourceShapeId &&
        connection.targetShapeId === input.targetShapeId &&
        connection.connectionType === input.connectionType &&
        !connection.deletedAt,
    );
  }

  private listVisibleShapes(boardId: string) {
    return Array.from(this.shapesById.values())
      .filter((shape) => shape.boardId === boardId && !shape.deletedAt)
      .sort((left, right) => left.zIndex - right.zIndex);
  }

  private listVisibleConnections(boardId: string) {
    return Array.from(this.connectionsById.values()).filter(
      (connection) => connection.boardId === boardId && !connection.deletedAt,
    );
  }

  private countShapes(boardId: string) {
    return this.listVisibleShapes(boardId).length;
  }

  private countConnections(boardId: string) {
    return this.listVisibleConnections(boardId).length;
  }

  private toBoardSummary(board: CanvasBoardRecord): CanvasBoardSummary {
    return {
      id: board.id,
      workspaceId: board.workspaceId,
      title: board.title,
      boardType: board.boardType,
      shapeCount: this.countShapes(board.id),
      connectionCount: this.countConnections(board.id),
      updatedAt: board.updatedAt,
    };
  }

  private toShapeSummary(shape: CanvasShapeRecord): CanvasShapeSummary {
    const position = this.positionsByShapeId.get(shape.id);

    return {
      id: shape.id,
      shapeType: shape.shapeType,
      entityType: shape.entityType,
      entityId: shape.entityId,
      displayTitle: shape.displayTitle,
      width: shape.width,
      height: shape.height,
      color: shape.color,
      isCollapsed: shape.isCollapsed,
      zIndex: shape.zIndex,
      createdByMemberId: shape.createdByMemberId,
      createdAt: shape.createdAt,
      updatedAt: shape.updatedAt,
      position: {
        x: position?.x ?? 0,
        y: position?.y ?? 0,
      },
    };
  }

  private toConnectionSummary(
    connection: CanvasConnectionRecord,
  ): CanvasConnectionSummary {
    return {
      id: connection.id,
      sourceShapeId: connection.sourceShapeId,
      targetShapeId: connection.targetShapeId,
      connectionType: connection.connectionType,
      label: connection.label,
    };
  }

  private toViewSetting(boardId: string, memberId: string): CanvasViewSetting {
    const setting = this.viewSettingsByKey.get(
      createMemberSettingKey(boardId, memberId),
    );

    return {
      zoom: setting?.zoom ?? 1,
      viewportX: setting?.viewportX ?? 0,
      viewportY: setting?.viewportY ?? 0,
    };
  }

  private toFilterSetting(
    boardId: string,
    memberId: string,
  ): CanvasFilterSetting {
    const setting = this.filterSettingsByKey.get(
      createMemberSettingKey(boardId, memberId),
    );

    return {
      enabledEntityTypes: setting?.enabledEntityTypes
        ? [...setting.enabledEntityTypes]
        : ["task", "meeting_report", "pull_request", "memo"],
      assigneeMemberId: setting?.assigneeMemberId ?? null,
      showDelayedOnly: setting?.showDelayedOnly ?? false,
      showRiskOnly: setting?.showRiskOnly ?? false,
      filters: setting?.filters ? { ...setting.filters } : {},
    };
  }
}

function createMemberSettingKey(boardId: string, memberId: string) {
  return `${boardId}:${memberId}`;
}
