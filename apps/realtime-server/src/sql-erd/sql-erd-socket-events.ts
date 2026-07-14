export const sqlErdClientEvents = {
  join: "sql-erd:join",
  leave: "sql-erd:leave",
  presenceUpdate: "sql-erd:presence:update",
} as const;

export const sqlErdServerEvents = {
  error: "sql-erd:error",
  joined: "sql-erd:joined",
  presenceLeave: "sql-erd:presence:leave",
  presenceUpdate: "sql-erd:presence:update",
  operation: "sql-erd:operation",
} as const;

export function isSqlErdOperationPayload(
  value: unknown
): value is SqlErdOperationPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  return payload.type === "layout_patch"
    && typeof payload.workspaceId === "string"
    && typeof payload.sessionId === "string"
    && typeof payload.id === "string"
    && typeof payload.opSeq === "number"
    && Number.isSafeInteger(payload.opSeq)
    && payload.opSeq > 0
    && typeof payload.patch === "object"
    && payload.patch !== null;
}
import type { SqlErdOperationPayload } from "./sql-erd-types";
