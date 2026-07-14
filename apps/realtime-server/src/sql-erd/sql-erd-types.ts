export type SqlErdAccessContext = {
  token: string;
  userId: string;
};

export type SqlErdPresencePoint = {
  x: number;
  y: number;
};

export type SqlErdPresenceTool =
  | "draw"
  | "eraser"
  | "frame"
  | "note"
  | "select"
  | "text";

export type SqlErdPresenceEditingMode =
  | "draw"
  | "move"
  | "relation"
  | "resize"
  | "sql"
  | null;

export type SqlErdPresenceSelectedObject = {
  id: string;
  type:
    | "annotation"
    | "frame"
    | "note"
    | "relation"
    | "stroke"
    | "table"
    | "text";
};

export type SqlErdRoomRef = {
  sessionId: string;
  workspaceId: string;
};

export type SqlErdJoinPayload = SqlErdRoomRef;

export type SqlErdPresenceUpdatePayload = SqlErdRoomRef & {
  cursor: SqlErdPresencePoint | null;
  editingMode: SqlErdPresenceEditingMode;
  selectedObjects: SqlErdPresenceSelectedObject[];
  sentAt: string;
  tool: SqlErdPresenceTool;
};

export type SqlErdPresenceUser = {
  displayName: string;
  userId: string;
};

export type SqlErdPresenceState = Omit<
  SqlErdPresenceUpdatePayload,
  "sentAt"
> & {
  displayName: string;
  sentAt: string;
  updatedAt: string;
  userId: string;
};

export type SqlErdPresenceLeavePayload = SqlErdRoomRef & {
  userId: string;
};

export type SqlErdJoinedPayload = SqlErdRoomRef & {
  latestOpSeq: number;
  presence: SqlErdPresenceState[];
};

export type SqlErdOperationPayload = SqlErdRoomRef & {
  actorUserId: string;
  appliedOnRevision: number;
  baseRevision: number;
  clientOperationId: string;
  createdAt: string;
  id: string;
  opSeq: number;
  patch: Record<string, unknown>;
  rebased: boolean;
  resultRevision: number;
  type: "layout_patch";
};
