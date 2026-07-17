import { isUuid } from "../chat/chat-identifiers";

export const WORKSPACE_MEMBERSHIP_REVOCATION_REDIS_CHANNEL =
  "workspace:membership-revocations";

export type WorkspaceMembershipRevokedEventV1 = {
  version: 1;
  type: "membership.revoked";
  workspaceId: string;
  userId: string;
  occurredAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const valueKeys = Object.keys(value);
  return (
    valueKeys.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

export function isWorkspaceMembershipRevokedEvent(
  value: unknown,
): value is WorkspaceMembershipRevokedEventV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "version",
      "type",
      "workspaceId",
      "userId",
      "occurredAt",
    ]) &&
    value.version === 1 &&
    value.type === "membership.revoked" &&
    isUuid(value.workspaceId) &&
    isUuid(value.userId) &&
    isCanonicalIsoTimestamp(value.occurredAt)
  );
}
