import { Injectable, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import type {
  CanvasBoardDetail,
  CanvasBoardCreateRequest,
  CanvasBoardRecord,
  CanvasBoardSummary,
  CanvasConnectionCreateResult,
  CanvasConnectionDeleteResult,
  CanvasConnectionRequest,
  CanvasConnectionRecord,
  CanvasConnectionSummary,
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

type DbCanvasBoardRow = {
  id: string;
  workspaceId: string;
  title: string;
  boardType: string;
  createdByMemberId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  shapeCount: number | bigint;
  connectionCount: number | bigint;
};

type DbCanvasShapeRow = {
  id: string;
  boardId: string;
  shapeType: string;
  entityType: string;
  entityId: string;
  displayTitle: string;
  width: number | string;
  height: number | string;
  color: string | null;
  isCollapsed: boolean;
  zIndex: number;
  createdByMemberId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  x: number | string | null;
  y: number | string | null;
};

type DbCanvasConnectionRow = {
  id: string;
  boardId: string;
  sourceShapeId: string;
  targetShapeId: string;
  connectionType: string;
  label: string | null;
  createdAt: Date | string;
};

type DbCanvasViewSettingRow = {
  boardId: string;
  memberId: string;
  zoom: number | string;
  viewportX: number | string;
  viewportY: number | string;
  updatedAt: Date | string;
};

type DbCanvasFilterSettingRow = {
  boardId: string;
  memberId: string;
  enabledEntityTypes: string[];
  assigneeMemberId: string | null;
  showDelayedOnly: boolean;
  showRiskOnly: boolean;
  filters: unknown;
  updatedAt: Date | string;
};

@Injectable()
export class CanvasRepository implements CanvasRepositoryPort {
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

  constructor(@Optional() private readonly database?: DatabaseService) {}

  get storageMode() {
    return this.shouldUseDatabase ? "database" : "memory";
  }

  async listBoardsForWorkspace(
    workspaceId: string,
  ): Promise<CanvasBoardSummary[]> {
    if (this.shouldUseDatabase) {
      return this.listDbBoardsForWorkspace(workspaceId);
    }

    return Array.from(this.boardsById.values())
      .filter((board) => board.workspaceId === workspaceId && !board.deletedAt)
      .map((board) => this.toBoardSummary(board))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async findBoardWorkspaceId(boardId: string): Promise<string | null> {
    if (this.shouldUseDatabase) {
      return this.findDbBoardWorkspaceId(boardId);
    }

    const board = this.findVisibleBoard(boardId);

    return board?.workspaceId ?? null;
  }

  async findShapeWorkspaceId(shapeId: string): Promise<string | null> {
    if (this.shouldUseDatabase) {
      return this.findDbShapeWorkspaceId(shapeId);
    }

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
    if (this.shouldUseDatabase) {
      return this.createDbBoardForWorkspace(input);
    }

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

  async findConnectionWorkspaceId(
    connectionId: string,
  ): Promise<string | null> {
    if (this.shouldUseDatabase) {
      return this.findDbConnectionWorkspaceId(connectionId);
    }

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
    if (this.shouldUseDatabase) {
      return this.findDbBoardDetail(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.createDbShapeForBoard(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.updateDbShape(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.deleteDbShape(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.upsertDbShapePosition(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.createDbConnectionForBoard(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.deleteDbConnection(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.upsertDbViewSettingForBoard(input);
    }

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
    if (this.shouldUseDatabase) {
      return this.upsertDbFilterSettingForBoard(input);
    }

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

  private get shouldUseDatabase() {
    return Boolean(
      this.database && process.env.PILO_SKIP_DATABASE_CONNECT !== "true",
    );
  }

  private get db() {
    if (!this.database) {
      throw new Error("Canvas database repository was not configured.");
    }

    return this.database;
  }

  private async listDbBoardsForWorkspace(
    workspaceId: string,
  ): Promise<CanvasBoardSummary[]> {
    const rows = await this.db.$queryRaw<DbCanvasBoardRow[]>`
      SELECT
        b.id::text AS id,
        b.workspace_id::text AS "workspaceId",
        b.title,
        b.board_type AS "boardType",
        b.created_by_member_id::text AS "createdByMemberId",
        b.created_at AS "createdAt",
        b.updated_at AS "updatedAt",
        COUNT(DISTINCT s.id)::int AS "shapeCount",
        COUNT(DISTINCT c.id)::int AS "connectionCount"
      FROM canvas_boards b
      LEFT JOIN canvas_shapes s ON s.canvas_board_id = b.id
      LEFT JOIN canvas_connections c ON c.canvas_board_id = b.id
      WHERE b.workspace_id = ${workspaceId}::uuid
      GROUP BY b.id
      ORDER BY b.updated_at DESC, b.id ASC
    `;

    return rows.map(toBoardSummaryFromDbRow);
  }

  private async findDbBoardWorkspaceId(
    boardId: string,
  ): Promise<string | null> {
    const rows = await this.db.$queryRaw<Array<{ workspaceId: string }>>`
      SELECT workspace_id::text AS "workspaceId"
      FROM canvas_boards
      WHERE id = ${boardId}::uuid
      LIMIT 1
    `;

    return rows[0]?.workspaceId ?? null;
  }

  private async findDbShapeWorkspaceId(
    shapeId: string,
  ): Promise<string | null> {
    const rows = await this.db.$queryRaw<Array<{ workspaceId: string }>>`
      SELECT b.workspace_id::text AS "workspaceId"
      FROM canvas_shapes s
      JOIN canvas_boards b ON b.id = s.canvas_board_id
      WHERE s.id = ${shapeId}::uuid
      LIMIT 1
    `;

    return rows[0]?.workspaceId ?? null;
  }

  private async findDbShapeBoardId(shapeId: string): Promise<string | null> {
    const rows = await this.db.$queryRaw<Array<{ boardId: string }>>`
      SELECT canvas_board_id::text AS "boardId"
      FROM canvas_shapes
      WHERE id = ${shapeId}::uuid
      LIMIT 1
    `;

    return rows[0]?.boardId ?? null;
  }

  private async findDbConnectionWorkspaceId(
    connectionId: string,
  ): Promise<string | null> {
    const rows = await this.db.$queryRaw<Array<{ workspaceId: string }>>`
      SELECT b.workspace_id::text AS "workspaceId"
      FROM canvas_connections c
      JOIN canvas_boards b ON b.id = c.canvas_board_id
      WHERE c.id = ${connectionId}::uuid
      LIMIT 1
    `;

    return rows[0]?.workspaceId ?? null;
  }

  private async createDbBoardForWorkspace(
    input: CanvasBoardCreateRequest & {
      workspaceId: string;
      createdByMemberId: string;
      now?: Date;
    },
  ): Promise<CanvasBoardSummary> {
    const now = (input.now ?? new Date()).toISOString();
    const rows = await this.db.$queryRaw<DbCanvasBoardRow[]>`
      INSERT INTO canvas_boards (
        workspace_id,
        title,
        board_type,
        created_by_member_id,
        created_at,
        updated_at
      )
      VALUES (
        ${input.workspaceId}::uuid,
        ${input.title},
        ${input.boardType},
        ${input.createdByMemberId}::uuid,
        ${now}::timestamptz,
        ${now}::timestamptz
      )
      RETURNING
        id::text AS id,
        workspace_id::text AS "workspaceId",
        title,
        board_type AS "boardType",
        created_by_member_id::text AS "createdByMemberId",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        0::int AS "shapeCount",
        0::int AS "connectionCount"
    `;

    return toBoardSummaryFromDbRow(rows[0]);
  }

  private async findDbBoardSummary(
    boardId: string,
  ): Promise<CanvasBoardSummary | null> {
    const rows = await this.db.$queryRaw<DbCanvasBoardRow[]>`
      SELECT
        b.id::text AS id,
        b.workspace_id::text AS "workspaceId",
        b.title,
        b.board_type AS "boardType",
        b.created_by_member_id::text AS "createdByMemberId",
        b.created_at AS "createdAt",
        b.updated_at AS "updatedAt",
        COUNT(DISTINCT s.id)::int AS "shapeCount",
        COUNT(DISTINCT c.id)::int AS "connectionCount"
      FROM canvas_boards b
      LEFT JOIN canvas_shapes s ON s.canvas_board_id = b.id
      LEFT JOIN canvas_connections c ON c.canvas_board_id = b.id
      WHERE b.id = ${boardId}::uuid
      GROUP BY b.id
      LIMIT 1
    `;

    return rows[0] ? toBoardSummaryFromDbRow(rows[0]) : null;
  }

  private async findDbBoardDetail(input: {
    boardId: string;
    memberId: string;
  }): Promise<CanvasBoardDetail | null> {
    const [board, shapes, connections, viewSetting, filterSetting] =
      await Promise.all([
        this.findDbBoardSummary(input.boardId),
        this.listDbShapesByBoard(input.boardId),
        this.listDbConnectionsByBoard(input.boardId),
        this.getDbViewSetting(input.boardId, input.memberId),
        this.getDbFilterSetting(input.boardId, input.memberId),
      ]);

    if (!board) {
      return null;
    }

    return {
      ...board,
      shapes,
      connections,
      viewSetting,
      filterSetting,
    };
  }

  private async createDbShapeForBoard(
    input: CanvasShapeRequest & {
      boardId: string;
      createdByMemberId: string;
      now?: Date;
    },
  ): Promise<CanvasShapeSummary | null> {
    const board = await this.findDbBoardSummary(input.boardId);

    if (!board) {
      return null;
    }

    const now = (input.now ?? new Date()).toISOString();
    const rows = await this.db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO canvas_shapes (
        canvas_board_id,
        shape_type,
        entity_type,
        entity_id,
        display_title,
        width,
        height,
        color,
        is_collapsed,
        z_index,
        created_by_member_id,
        created_at,
        updated_at
      )
      VALUES (
        ${input.boardId}::uuid,
        ${input.shapeType},
        ${input.entityType},
        ${input.entityId}::uuid,
        ${input.displayTitle},
        ${input.width},
        ${input.height},
        ${input.color},
        false,
        ${board.shapeCount + 1},
        ${input.createdByMemberId}::uuid,
        ${now}::timestamptz,
        ${now}::timestamptz
      )
      RETURNING id::text AS id
    `;

    await this.touchDbBoard(input.boardId, now);
    return this.findDbShapeSummary(rows[0].id);
  }

  private async updateDbShape(
    input: CanvasShapeUpdateRequest & {
      shapeId: string;
      now?: Date;
    },
  ): Promise<CanvasShapeSummary | null> {
    const existing = await this.findDbShapeRecord(input.shapeId);

    if (!existing) {
      return null;
    }

    const now = (input.now ?? new Date()).toISOString();
    const rows = await this.db.$queryRaw<Array<{ id: string }>>`
      UPDATE canvas_shapes
      SET
        display_title = ${input.displayTitle ?? existing.displayTitle},
        width = ${input.width ?? existing.width},
        height = ${input.height ?? existing.height},
        color = ${input.color ?? existing.color},
        is_collapsed = ${input.isCollapsed ?? existing.isCollapsed},
        z_index = ${input.zIndex ?? existing.zIndex},
        updated_at = ${now}::timestamptz
      WHERE id = ${input.shapeId}::uuid
      RETURNING id::text AS id
    `;

    if (!rows[0]) {
      return null;
    }

    await this.touchDbBoard(existing.boardId, now);
    return this.findDbShapeSummary(input.shapeId);
  }

  private async deleteDbShape(input: {
    shapeId: string;
    now?: Date;
  }): Promise<CanvasShapeDeleteResult | null> {
    const existing = await this.findDbShapeRecord(input.shapeId);

    if (!existing) {
      return null;
    }

    const rows = await this.db.$queryRaw<Array<{ id: string }>>`
      DELETE FROM canvas_shapes
      WHERE id = ${input.shapeId}::uuid
      RETURNING id::text AS id
    `;

    if (!rows[0]) {
      return null;
    }

    await this.touchDbBoard(
      existing.boardId,
      (input.now ?? new Date()).toISOString(),
    );

    return {
      id: input.shapeId,
      deleted: true,
    };
  }

  private async upsertDbShapePosition(input: {
    shapeId: string;
    x: number;
    y: number;
    now?: Date;
  }): Promise<CanvasShapeSummary | null> {
    const existing = await this.findDbShapeRecord(input.shapeId);

    if (!existing) {
      return null;
    }

    const now = (input.now ?? new Date()).toISOString();
    await this.db.$executeRaw`
      INSERT INTO canvas_node_positions (
        canvas_shape_id,
        x,
        y,
        created_at,
        updated_at
      )
      VALUES (
        ${input.shapeId}::uuid,
        ${input.x},
        ${input.y},
        ${now}::timestamptz,
        ${now}::timestamptz
      )
      ON CONFLICT (canvas_shape_id) DO UPDATE SET
        x = EXCLUDED.x,
        y = EXCLUDED.y,
        updated_at = EXCLUDED.updated_at
    `;

    await this.touchDbBoard(existing.boardId, now);
    return this.findDbShapeSummary(input.shapeId);
  }

  private async createDbConnectionForBoard(
    input: CanvasConnectionRequest & {
      boardId: string;
      now?: Date;
    },
  ): Promise<CanvasConnectionCreateResult> {
    const [boardWorkspaceId, sourceBoardId, targetBoardId, duplicate] =
      await Promise.all([
        this.findDbBoardWorkspaceId(input.boardId),
        this.findDbShapeBoardId(input.sourceShapeId),
        this.findDbShapeBoardId(input.targetShapeId),
        this.findDbDuplicateConnection(input),
      ]);

    if (
      !boardWorkspaceId ||
      sourceBoardId !== input.boardId ||
      targetBoardId !== input.boardId ||
      input.sourceShapeId === input.targetShapeId
    ) {
      return { status: "invalid" };
    }

    if (duplicate) {
      return { status: "duplicate" };
    }

    const now = (input.now ?? new Date()).toISOString();
    const rows = await this.db.$queryRaw<DbCanvasConnectionRow[]>`
      INSERT INTO canvas_connections (
        canvas_board_id,
        source_shape_id,
        target_shape_id,
        connection_type,
        label,
        created_at
      )
      VALUES (
        ${input.boardId}::uuid,
        ${input.sourceShapeId}::uuid,
        ${input.targetShapeId}::uuid,
        ${input.connectionType},
        ${input.label},
        ${now}::timestamptz
      )
      RETURNING
        id::text AS id,
        canvas_board_id::text AS "boardId",
        source_shape_id::text AS "sourceShapeId",
        target_shape_id::text AS "targetShapeId",
        connection_type AS "connectionType",
        label,
        created_at AS "createdAt"
    `;

    await this.touchDbBoard(input.boardId, now);

    return {
      status: "created",
      connection: toConnectionSummaryFromDbRow(rows[0]),
    };
  }

  private async deleteDbConnection(input: {
    connectionId: string;
    now?: Date;
  }): Promise<CanvasConnectionDeleteResult | null> {
    const rows = await this.db.$queryRaw<
      Array<{ id: string; boardId: string }>
    >`
      DELETE FROM canvas_connections
      WHERE id = ${input.connectionId}::uuid
      RETURNING id::text AS id, canvas_board_id::text AS "boardId"
    `;

    if (!rows[0]) {
      return null;
    }

    await this.touchDbBoard(
      rows[0].boardId,
      (input.now ?? new Date()).toISOString(),
    );

    return {
      id: input.connectionId,
      deleted: true,
    };
  }

  private async upsertDbViewSettingForBoard(
    input: CanvasViewSettingRequest & {
      boardId: string;
      memberId: string;
      now?: Date;
    },
  ): Promise<CanvasViewSetting | null> {
    const workspaceId = await this.findDbBoardWorkspaceId(input.boardId);

    if (!workspaceId) {
      return null;
    }

    const now = (input.now ?? new Date()).toISOString();
    const rows = await this.db.$queryRaw<DbCanvasViewSettingRow[]>`
      INSERT INTO canvas_view_settings (
        canvas_board_id,
        workspace_id,
        member_id,
        zoom,
        viewport_x,
        viewport_y,
        created_at,
        updated_at
      )
      VALUES (
        ${input.boardId}::uuid,
        ${workspaceId}::uuid,
        ${input.memberId}::uuid,
        ${input.zoom},
        ${input.viewportX},
        ${input.viewportY},
        ${now}::timestamptz,
        ${now}::timestamptz
      )
      ON CONFLICT (workspace_id, canvas_board_id, member_id) DO UPDATE SET
        zoom = EXCLUDED.zoom,
        viewport_x = EXCLUDED.viewport_x,
        viewport_y = EXCLUDED.viewport_y,
        updated_at = EXCLUDED.updated_at
      RETURNING
        canvas_board_id::text AS "boardId",
        member_id::text AS "memberId",
        zoom,
        viewport_x AS "viewportX",
        viewport_y AS "viewportY",
        updated_at AS "updatedAt"
    `;

    await this.touchDbBoard(input.boardId, now);
    return toViewSettingFromDbRow(rows[0]);
  }

  private async upsertDbFilterSettingForBoard(
    input: CanvasFilterSettingRequest & {
      boardId: string;
      memberId: string;
      now?: Date;
    },
  ): Promise<CanvasFilterSetting | null> {
    const workspaceId = await this.findDbBoardWorkspaceId(input.boardId);

    if (!workspaceId) {
      return null;
    }

    const now = (input.now ?? new Date()).toISOString();
    const filters = JSON.stringify(input.filters);
    const rows = await this.db.$queryRaw<DbCanvasFilterSettingRow[]>`
      INSERT INTO canvas_filter_settings (
        canvas_board_id,
        workspace_id,
        member_id,
        enabled_entity_types,
        assignee_member_id,
        show_delayed_only,
        show_risk_only,
        filters,
        created_at,
        updated_at
      )
      VALUES (
        ${input.boardId}::uuid,
        ${workspaceId}::uuid,
        ${input.memberId}::uuid,
        ${input.enabledEntityTypes},
        ${input.assigneeMemberId}::uuid,
        ${input.showDelayedOnly},
        ${input.showRiskOnly},
        ${filters}::jsonb,
        ${now}::timestamptz,
        ${now}::timestamptz
      )
      ON CONFLICT (workspace_id, canvas_board_id, member_id) DO UPDATE SET
        enabled_entity_types = EXCLUDED.enabled_entity_types,
        assignee_member_id = EXCLUDED.assignee_member_id,
        show_delayed_only = EXCLUDED.show_delayed_only,
        show_risk_only = EXCLUDED.show_risk_only,
        filters = EXCLUDED.filters,
        updated_at = EXCLUDED.updated_at
      RETURNING
        canvas_board_id::text AS "boardId",
        member_id::text AS "memberId",
        enabled_entity_types AS "enabledEntityTypes",
        assignee_member_id::text AS "assigneeMemberId",
        show_delayed_only AS "showDelayedOnly",
        show_risk_only AS "showRiskOnly",
        filters,
        updated_at AS "updatedAt"
    `;

    await this.touchDbBoard(input.boardId, now);
    return toFilterSettingFromDbRow(rows[0]);
  }

  private async listDbShapesByBoard(
    boardId: string,
  ): Promise<CanvasShapeSummary[]> {
    const rows = await this.db.$queryRaw<DbCanvasShapeRow[]>`
      SELECT
        s.id::text AS id,
        s.canvas_board_id::text AS "boardId",
        s.shape_type AS "shapeType",
        s.entity_type AS "entityType",
        s.entity_id::text AS "entityId",
        s.display_title AS "displayTitle",
        s.width,
        s.height,
        s.color,
        s.is_collapsed AS "isCollapsed",
        s.z_index AS "zIndex",
        s.created_by_member_id::text AS "createdByMemberId",
        s.created_at AS "createdAt",
        s.updated_at AS "updatedAt",
        p.x,
        p.y
      FROM canvas_shapes s
      LEFT JOIN canvas_node_positions p ON p.canvas_shape_id = s.id
      WHERE s.canvas_board_id = ${boardId}::uuid
      ORDER BY s.z_index ASC, s.created_at ASC, s.id ASC
    `;

    return rows.map(toShapeSummaryFromDbRow);
  }

  private async listDbConnectionsByBoard(
    boardId: string,
  ): Promise<CanvasConnectionSummary[]> {
    const rows = await this.db.$queryRaw<DbCanvasConnectionRow[]>`
      SELECT
        id::text AS id,
        canvas_board_id::text AS "boardId",
        source_shape_id::text AS "sourceShapeId",
        target_shape_id::text AS "targetShapeId",
        connection_type AS "connectionType",
        label,
        created_at AS "createdAt"
      FROM canvas_connections
      WHERE canvas_board_id = ${boardId}::uuid
      ORDER BY created_at ASC, id ASC
    `;

    return rows.map(toConnectionSummaryFromDbRow);
  }

  private async findDbShapeRecord(
    shapeId: string,
  ): Promise<CanvasShapeRecord | null> {
    const rows = await this.db.$queryRaw<DbCanvasShapeRow[]>`
      SELECT
        s.id::text AS id,
        s.canvas_board_id::text AS "boardId",
        s.shape_type AS "shapeType",
        s.entity_type AS "entityType",
        s.entity_id::text AS "entityId",
        s.display_title AS "displayTitle",
        s.width,
        s.height,
        s.color,
        s.is_collapsed AS "isCollapsed",
        s.z_index AS "zIndex",
        s.created_by_member_id::text AS "createdByMemberId",
        s.created_at AS "createdAt",
        s.updated_at AS "updatedAt",
        p.x,
        p.y
      FROM canvas_shapes s
      LEFT JOIN canvas_node_positions p ON p.canvas_shape_id = s.id
      WHERE s.id = ${shapeId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toShapeRecordFromDbRow(rows[0]) : null;
  }

  private async findDbShapeSummary(
    shapeId: string,
  ): Promise<CanvasShapeSummary | null> {
    const row = await this.findDbShapeRecord(shapeId);
    return row ? this.toShapeSummary(row) : null;
  }

  private async getDbViewSetting(
    boardId: string,
    memberId: string,
  ): Promise<CanvasViewSetting> {
    const rows = await this.db.$queryRaw<DbCanvasViewSettingRow[]>`
      SELECT
        canvas_board_id::text AS "boardId",
        member_id::text AS "memberId",
        zoom,
        viewport_x AS "viewportX",
        viewport_y AS "viewportY",
        updated_at AS "updatedAt"
      FROM canvas_view_settings
      WHERE canvas_board_id = ${boardId}::uuid
        AND member_id = ${memberId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toViewSettingFromDbRow(rows[0]) : defaultViewSetting();
  }

  private async getDbFilterSetting(
    boardId: string,
    memberId: string,
  ): Promise<CanvasFilterSetting> {
    const rows = await this.db.$queryRaw<DbCanvasFilterSettingRow[]>`
      SELECT
        canvas_board_id::text AS "boardId",
        member_id::text AS "memberId",
        enabled_entity_types AS "enabledEntityTypes",
        assignee_member_id::text AS "assigneeMemberId",
        show_delayed_only AS "showDelayedOnly",
        show_risk_only AS "showRiskOnly",
        filters,
        updated_at AS "updatedAt"
      FROM canvas_filter_settings
      WHERE canvas_board_id = ${boardId}::uuid
        AND member_id = ${memberId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toFilterSettingFromDbRow(rows[0]) : defaultFilterSetting();
  }

  private async findDbDuplicateConnection(input: {
    boardId: string;
    sourceShapeId: string;
    targetShapeId: string;
    connectionType: string;
  }): Promise<CanvasConnectionSummary | null> {
    const rows = await this.db.$queryRaw<DbCanvasConnectionRow[]>`
      SELECT
        id::text AS id,
        canvas_board_id::text AS "boardId",
        source_shape_id::text AS "sourceShapeId",
        target_shape_id::text AS "targetShapeId",
        connection_type AS "connectionType",
        label,
        created_at AS "createdAt"
      FROM canvas_connections
      WHERE canvas_board_id = ${input.boardId}::uuid
        AND source_shape_id = ${input.sourceShapeId}::uuid
        AND target_shape_id = ${input.targetShapeId}::uuid
        AND connection_type = ${input.connectionType}
      LIMIT 1
    `;

    return rows[0] ? toConnectionSummaryFromDbRow(rows[0]) : null;
  }

  private async touchDbBoard(boardId: string, updatedAt: string) {
    await this.db.$executeRaw`
      UPDATE canvas_boards
      SET updated_at = ${updatedAt}::timestamptz
      WHERE id = ${boardId}::uuid
    `;
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
    connectionType: string;
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
        : ["task", "meeting_report", "pull_request"],
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

function toBoardSummaryFromDbRow(row: DbCanvasBoardRow): CanvasBoardSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    boardType: row.boardType as CanvasBoardSummary["boardType"],
    shapeCount: Number(row.shapeCount),
    connectionCount: Number(row.connectionCount),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toShapeRecordFromDbRow(row: DbCanvasShapeRow): CanvasShapeRecord {
  return {
    id: row.id,
    boardId: row.boardId,
    shapeType: row.shapeType as CanvasShapeRecord["shapeType"],
    entityType: row.entityType as CanvasShapeRecord["entityType"],
    entityId: row.entityId,
    displayTitle: row.displayTitle,
    width: Number(row.width),
    height: Number(row.height),
    color: row.color ?? "",
    isCollapsed: row.isCollapsed,
    zIndex: Number(row.zIndex),
    createdByMemberId: row.createdByMemberId ?? "",
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    deletedAt: null,
  };
}

function toShapeSummaryFromDbRow(row: DbCanvasShapeRow): CanvasShapeSummary {
  return {
    id: row.id,
    shapeType: row.shapeType as CanvasShapeSummary["shapeType"],
    entityType: row.entityType as CanvasShapeSummary["entityType"],
    entityId: row.entityId,
    displayTitle: row.displayTitle,
    width: Number(row.width),
    height: Number(row.height),
    color: row.color ?? "",
    isCollapsed: row.isCollapsed,
    zIndex: Number(row.zIndex),
    position: {
      x: row.x === null ? 0 : Number(row.x),
      y: row.y === null ? 0 : Number(row.y),
    },
  };
}

function toConnectionSummaryFromDbRow(
  row: DbCanvasConnectionRow,
): CanvasConnectionSummary {
  return {
    id: row.id,
    sourceShapeId: row.sourceShapeId,
    targetShapeId: row.targetShapeId,
    connectionType: row.connectionType,
    label: row.label,
  };
}

function toViewSettingFromDbRow(
  row: DbCanvasViewSettingRow,
): CanvasViewSetting {
  return {
    zoom: Number(row.zoom),
    viewportX: Number(row.viewportX),
    viewportY: Number(row.viewportY),
  };
}

function toFilterSettingFromDbRow(
  row: DbCanvasFilterSettingRow,
): CanvasFilterSetting {
  return {
    enabledEntityTypes:
      row.enabledEntityTypes as CanvasFilterSetting["enabledEntityTypes"],
    assigneeMemberId: row.assigneeMemberId,
    showDelayedOnly: row.showDelayedOnly,
    showRiskOnly: row.showRiskOnly,
    filters:
      row.filters &&
      typeof row.filters === "object" &&
      !Array.isArray(row.filters)
        ? (row.filters as Record<string, unknown>)
        : {},
  };
}

function defaultViewSetting(): CanvasViewSetting {
  return {
    zoom: 1,
    viewportX: 0,
    viewportY: 0,
  };
}

function defaultFilterSetting(): CanvasFilterSetting {
  return {
    enabledEntityTypes: ["task", "meeting_report", "pull_request"],
    assigneeMemberId: null,
    showDelayedOnly: false,
    showRiskOnly: false,
    filters: {},
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
