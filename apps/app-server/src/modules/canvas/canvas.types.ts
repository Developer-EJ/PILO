import type {
  CurrentWorkspaceMember,
  WorkspaceAuthUserRef,
} from "../workspace/workspace.types";

export type CanvasAuthUserRef = WorkspaceAuthUserRef;

export type CanvasEntityType =
  | "task"
  | "meeting_report"
  | "pull_request"
  | "github_issue"
  | "document"
  | "file"
  | "code"
  | "decision"
  | "memo"
  | "risk";

export type CanvasBoardType = "project_map" | "meeting" | "review" | "custom";

export type CanvasConnectionType =
  | "related_to"
  | "created_from"
  | "blocks"
  | "references"
  | "implements"
  | "reviews";

export type CanvasBoardRecord = {
  id: string;
  workspaceId: string;
  title: string;
  boardType: CanvasBoardType;
  createdByMemberId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CanvasShapeRecord = {
  id: string;
  boardId: string;
  shapeType: CanvasEntityType;
  entityType: CanvasEntityType;
  entityId: string;
  displayTitle: string;
  width: number;
  height: number;
  color: string;
  isCollapsed: boolean;
  zIndex: number;
  createdByMemberId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CanvasNodePositionRecord = {
  shapeId: string;
  x: number;
  y: number;
  updatedAt: string;
};

export type CanvasConnectionRecord = {
  id: string;
  boardId: string;
  sourceShapeId: string;
  targetShapeId: string;
  connectionType: CanvasConnectionType;
  label: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CanvasViewSettingRecord = {
  boardId: string;
  memberId: string;
  zoom: number;
  viewportX: number;
  viewportY: number;
  updatedAt: string;
};

export type CanvasFilterSettingRecord = {
  boardId: string;
  memberId: string;
  enabledEntityTypes: CanvasEntityType[];
  assigneeMemberId: string | null;
  showDelayedOnly: boolean;
  showRiskOnly: boolean;
  filters: Record<string, unknown>;
  updatedAt: string;
};

export type CanvasShapeSummary = {
  id: string;
  shapeType: CanvasEntityType;
  entityType: CanvasEntityType;
  entityId: string;
  displayTitle: string;
  width: number;
  height: number;
  color: string;
  isCollapsed: boolean;
  zIndex: number;
  createdByMemberId?: string;
  createdAt?: string;
  updatedAt?: string;
  position: {
    x: number;
    y: number;
  };
};

export type CanvasBoardCreateRequest = {
  title: string;
  boardType: CanvasBoardType;
};

export type CanvasShapeRequest = {
  shapeType: CanvasEntityType;
  entityType: CanvasEntityType;
  entityId: string;
  displayTitle: string;
  width: number;
  height: number;
  color: string;
};

export type CanvasShapeUpdateRequest = Partial<
  Pick<
    CanvasShapeSummary,
    "displayTitle" | "width" | "height" | "color" | "isCollapsed" | "zIndex"
  >
>;

export type CanvasShapeDeleteResult = {
  id: string;
  deleted: true;
};

export type CanvasBoardDeleteResult = {
  id: string;
  deleted: true;
};

export type CanvasShapePositionRequest = {
  x: number;
  y: number;
};

export type CanvasConnectionSummary = {
  id: string;
  sourceShapeId: string;
  targetShapeId: string;
  connectionType: CanvasConnectionType;
  label: string | null;
};

export type CanvasConnectionRequest = {
  sourceShapeId: string;
  targetShapeId: string;
  connectionType: CanvasConnectionType;
  label: string | null;
};

export type CanvasConnectionDeleteResult = {
  id: string;
  deleted: true;
};

export type CanvasViewSetting = {
  zoom: number;
  viewportX: number;
  viewportY: number;
};

export type CanvasViewSettingRequest = CanvasViewSetting;

export type CanvasFilterSetting = {
  enabledEntityTypes: CanvasEntityType[];
  assigneeMemberId: string | null;
  showDelayedOnly: boolean;
  showRiskOnly: boolean;
  filters: Record<string, unknown>;
};

export type CanvasFilterSettingRequest = CanvasFilterSetting;

export type CanvasConnectionCreateResult =
  | {
      status: "created";
      connection: CanvasConnectionSummary;
    }
  | {
      status: "duplicate";
    }
  | {
      status: "invalid";
    };

export type CanvasBoardSummary = {
  id: string;
  workspaceId: string;
  title: string;
  boardType: CanvasBoardType;
  shapeCount: number;
  connectionCount: number;
  updatedAt: string;
};

export type CanvasBoardDetail = CanvasBoardSummary & {
  shapes: CanvasShapeSummary[];
  connections: CanvasConnectionSummary[];
  viewSetting: CanvasViewSetting;
  filterSetting: CanvasFilterSetting;
};

export type CanvasCurrentMemberContext = {
  currentMember: CurrentWorkspaceMember;
  permissions: {
    canRead: boolean;
    canWrite: boolean;
    canManage: boolean;
  };
};

export type CanvasRepositoryPort = {
  readonly storageMode: string;
  listBoardsForWorkspace(workspaceId: string): Promise<CanvasBoardSummary[]>;
  findBoardWorkspaceId(boardId: string): Promise<string | null>;
  findShapeWorkspaceId(shapeId: string): Promise<string | null>;
  createBoardForWorkspace(
    input: CanvasBoardCreateRequest & {
      workspaceId: string;
      createdByMemberId: string;
      now?: Date;
    },
  ): Promise<CanvasBoardSummary>;
  deleteBoard(input: {
    boardId: string;
    now?: Date;
  }): Promise<CanvasBoardDeleteResult | null>;
  findBoardDetail(input: {
    boardId: string;
    memberId: string;
  }): Promise<CanvasBoardDetail | null>;
  createShapeForBoard(
    input: CanvasShapeRequest & {
      boardId: string;
      createdByMemberId: string;
      now?: Date;
    },
  ): Promise<CanvasShapeSummary | null>;
  updateShape(
    input: CanvasShapeUpdateRequest & {
      shapeId: string;
      now?: Date;
    },
  ): Promise<CanvasShapeSummary | null>;
  deleteShape(input: {
    shapeId: string;
    now?: Date;
  }): Promise<CanvasShapeDeleteResult | null>;
  createConnectionForBoard(
    input: CanvasConnectionRequest & {
      boardId: string;
      now?: Date;
    },
  ): Promise<CanvasConnectionCreateResult>;
  deleteConnection(input: {
    connectionId: string;
    now?: Date;
  }): Promise<CanvasConnectionDeleteResult | null>;
  findConnectionWorkspaceId(connectionId: string): Promise<string | null>;
  upsertViewSettingForBoard(
    input: CanvasViewSettingRequest & {
      boardId: string;
      memberId: string;
      now?: Date;
    },
  ): Promise<CanvasViewSetting | null>;
  upsertFilterSettingForBoard(
    input: CanvasFilterSettingRequest & {
      boardId: string;
      memberId: string;
      now?: Date;
    },
  ): Promise<CanvasFilterSetting | null>;
  upsertShapePosition(
    input: CanvasShapePositionRequest & {
      shapeId: string;
      now?: Date;
    },
  ): Promise<CanvasShapeSummary | null>;
};
