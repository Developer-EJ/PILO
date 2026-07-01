export const MEETING_EVENT_TYPE_VALUES = [
  "STT",
  "CHAT",
  "CANVAS",
  "NOTE",
  "TASK",
  "GITHUB",
  "VOICE_ROOM",
] as const;

export type MeetingEventType = (typeof MEETING_EVENT_TYPE_VALUES)[number];

export const MEETING_EVENT_PAYLOAD_SCHEMA_VERSION = "meeting-event.v1";

export const CANVAS_MEETING_EVENT_ACTION_VALUES = [
  "SHAPE_CREATED",
  "SHAPE_UPDATED",
  "SHAPE_DELETED",
  "SHAPE_DISPLAY_TITLE_CHANGED",
  "SHAPE_POSITION_CHANGED",
  "CONNECTION_CREATED",
  "CONNECTION_UPDATED",
  "CONNECTION_DELETED",
  "CONNECTION_LABEL_CHANGED",
] as const;

export const TASK_MEETING_EVENT_ACTION_VALUES = [
  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_DELETED",
  "TASK_STATUS_CHANGED",
  "TASK_ASSIGNEE_CHANGED",
  "TASK_DESCRIPTION_CHANGED",
  "TASK_DUE_DATE_CHANGED",
  "TASK_PRIORITY_CHANGED",
] as const;

export const GITHUB_MEETING_EVENT_ACTION_VALUES = [
  "PR_REVIEW_REQUESTED",
  "PR_COMMENT_CREATED",
  "PR_STATUS_CHANGED",
  "PR_MERGED",
  "ISSUE_STATUS_CHANGED",
  "ISSUE_COMMENT_CREATED",
  "ISSUE_LINKED_TO_TASK",
] as const;

export const CHAT_MEETING_EVENT_ACTION_VALUES = [
  "MESSAGE_SENT",
  "MESSAGE_EDITED",
  "MESSAGE_DELETED",
] as const;

export const VOICE_ROOM_MEETING_EVENT_ACTION_VALUES = [
  "PARTICIPANT_JOINED",
  "PARTICIPANT_LEFT",
  "MICROPHONE_MUTED",
  "MICROPHONE_UNMUTED",
  "SPEAKING_STARTED",
  "SPEAKING_STOPPED",
] as const;

export type CanvasMeetingEventAction =
  (typeof CANVAS_MEETING_EVENT_ACTION_VALUES)[number];
export type TaskMeetingEventAction =
  (typeof TASK_MEETING_EVENT_ACTION_VALUES)[number];
export type GithubMeetingEventAction =
  (typeof GITHUB_MEETING_EVENT_ACTION_VALUES)[number];
export type ChatMeetingEventAction =
  (typeof CHAT_MEETING_EVENT_ACTION_VALUES)[number];
export type VoiceRoomMeetingEventAction =
  (typeof VOICE_ROOM_MEETING_EVENT_ACTION_VALUES)[number];

export type MeetingEventSourceDomain =
  | "canvas"
  | "task"
  | "github"
  | "chat"
  | "voice_room";

export type MeetingEventEntityType =
  | "canvas_shape"
  | "canvas_connection"
  | "task"
  | "github_pull_request"
  | "github_issue"
  | "github_comment"
  | "chat_message"
  | "voice_room"
  | "voice_session";

export type MeetingEventChangeOperation =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "STATE";

export type MeetingEventPayload = Record<string, unknown>;

export interface MeetingEventPayloadValidationResult {
  valid: boolean;
  errors: string[];
  payload?: MeetingEventPayload;
}

const EVENT_TYPE_SET = new Set<string>(MEETING_EVENT_TYPE_VALUES);
const OPERATION_SET = new Set<string>(["CREATE", "UPDATE", "DELETE", "STATE"]);
const CANVAS_ACTION_SET = new Set<string>(CANVAS_MEETING_EVENT_ACTION_VALUES);
const TASK_ACTION_SET = new Set<string>(TASK_MEETING_EVENT_ACTION_VALUES);
const GITHUB_ACTION_SET = new Set<string>(GITHUB_MEETING_EVENT_ACTION_VALUES);
const CHAT_ACTION_SET = new Set<string>(CHAT_MEETING_EVENT_ACTION_VALUES);
const VOICE_ROOM_ACTION_SET = new Set<string>(
  VOICE_ROOM_MEETING_EVENT_ACTION_VALUES,
);

const CANVAS_ENTITY_TYPE_SET = new Set<string>([
  "task",
  "meeting_report",
  "pull_request",
  "github_issue",
  "document",
  "file",
  "code",
  "decision",
  "risk",
]);
const MICROPHONE_STATE_SET = new Set<string>(["muted", "unmuted", "unknown"]);

export function isMeetingEventType(value: unknown): value is MeetingEventType {
  return typeof value === "string" && EVENT_TYPE_SET.has(value);
}

export function validateMeetingEventPayloadContract(
  eventType: MeetingEventType,
  payload: unknown,
): MeetingEventPayloadValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(payload)) {
    return {
      valid: false,
      errors: ["payload must be an object"],
    };
  }

  if (eventType === "NOTE" || eventType === "STT") {
    return {
      valid: true,
      errors: [],
      payload,
    };
  }

  validateBasePayload(eventType, payload, errors);

  if (eventType === "CANVAS") validateCanvasPayload(payload, errors);
  if (eventType === "TASK") validateTaskPayload(payload, errors);
  if (eventType === "GITHUB") validateGithubPayload(payload, errors);
  if (eventType === "CHAT") validateChatPayload(payload, errors);
  if (eventType === "VOICE_ROOM") validateVoiceRoomPayload(payload, errors);

  return {
    valid: errors.length === 0,
    errors,
    payload: errors.length === 0 ? payload : undefined,
  };
}

function validateBasePayload(
  eventType: Exclude<MeetingEventType, "NOTE" | "STT">,
  payload: Record<string, unknown>,
  errors: string[],
): void {
  const schemaVersion = payload.schemaVersion;
  if (schemaVersion !== MEETING_EVENT_PAYLOAD_SCHEMA_VERSION) {
    errors.push(
      `payload.schemaVersion must be ${MEETING_EVENT_PAYLOAD_SCHEMA_VERSION}`,
    );
  }

  const action = payload.action;
  if (typeof action !== "string") {
    errors.push("payload.action must be a string");
  } else if (!actionSetForEventType(eventType).has(action)) {
    errors.push(`payload.action is not allowed for eventType ${eventType}`);
  }

  requireIsoDateTime(payload, "occurredAt", errors);
  validateSource(eventType, payload.source, errors);
  validateActor(payload.actor, errors);
  validateTarget(eventType, payload.target, errors);
  validateChange(payload.change, errors);
  requireNonEmptyString(payload, "summary", errors);
}

function validateSource(
  eventType: Exclude<MeetingEventType, "NOTE" | "STT">,
  source: unknown,
  errors: string[],
): void {
  if (!isPlainObject(source)) {
    errors.push("payload.source must be an object");
    return;
  }

  const expectedDomain = sourceDomainForEventType(eventType);
  if (source.domain !== expectedDomain) {
    errors.push(`payload.source.domain must be ${expectedDomain}`);
  }

  optionalNonEmptyString(source, "clientEventId", errors);
  optionalNonEmptyString(source, "requestId", errors);
}

function validateActor(actor: unknown, errors: string[]): void {
  if (!isPlainObject(actor)) {
    errors.push("payload.actor must be an object");
    return;
  }

  requireStringOrNull(actor, "userId", errors);
  requireStringOrNull(actor, "memberId", errors);
  requireStringOrNull(actor, "displayName", errors);
}

function validateTarget(
  eventType: Exclude<MeetingEventType, "NOTE" | "STT">,
  target: unknown,
  errors: string[],
): void {
  if (!isPlainObject(target)) {
    errors.push("payload.target must be an object");
    return;
  }

  requireNonEmptyString(target, "workspaceId", errors);
  requireNonEmptyString(target, "entityId", errors);

  const allowedEntityTypes = targetEntityTypesForEventType(eventType);
  if (
    typeof target.entityType !== "string" ||
    !allowedEntityTypes.has(target.entityType as MeetingEventEntityType)
  ) {
    errors.push(
      `payload.target.entityType must be one of: ${[...allowedEntityTypes].join(
        ", ",
      )}`,
    );
  }

  if (eventType === "CANVAS") {
    requireNonEmptyString(target, "boardId", errors);
  }

  if (eventType === "VOICE_ROOM") {
    requireNonEmptyString(target, "voiceRoomId", errors);
  }
}

function validateChange(change: unknown, errors: string[]): void {
  if (!isPlainObject(change)) {
    errors.push("payload.change must be an object");
    return;
  }

  const operation = change.operation;
  if (typeof operation !== "string" || !OPERATION_SET.has(operation)) {
    errors.push(
      "payload.change.operation must be CREATE, UPDATE, DELETE, or STATE",
    );
    return;
  }

  if (
    !Array.isArray(change.changedFields) ||
    !change.changedFields.every(
      (field) => typeof field === "string" && field.trim().length > 0,
    )
  ) {
    errors.push("payload.change.changedFields must be non-empty strings");
  }

  if (operation === "CREATE") {
    requireNull(change.before, "payload.change.before", errors);
    requireObject(change.after, "payload.change.after", errors);
    requireObject(change.snapshot, "payload.change.snapshot", errors);
    return;
  }

  if (operation === "UPDATE") {
    requireObject(change.before, "payload.change.before", errors);
    requireObject(change.after, "payload.change.after", errors);
    requireObject(change.snapshot, "payload.change.snapshot", errors);
    return;
  }

  if (operation === "DELETE") {
    requireObject(change.before, "payload.change.before", errors);
    requireNull(change.after, "payload.change.after", errors);
    requireNull(change.snapshot, "payload.change.snapshot", errors);
    return;
  }

  requireObjectOrNull(change.before, "payload.change.before", errors);
  requireObjectOrNull(change.after, "payload.change.after", errors);
  requireObjectOrNull(change.snapshot, "payload.change.snapshot", errors);
}

function validateCanvasPayload(
  payload: Record<string, unknown>,
  errors: string[],
): void {
  assertNoDeprecatedCanvasKeys(payload, "$.payload", errors);

  const action = String(payload.action);
  const target = asObject(payload.target);
  const change = asObject(payload.change);
  const entityType = target?.entityType;

  if (action.startsWith("SHAPE_") && entityType !== "canvas_shape") {
    errors.push("shape actions require target.entityType = canvas_shape");
  }

  if (action.startsWith("CONNECTION_") && entityType !== "canvas_connection") {
    errors.push(
      "connection actions require target.entityType = canvas_connection",
    );
  }

  expectOperationForAction(
    action,
    change?.operation,
    {
      SHAPE_CREATED: "CREATE",
      CONNECTION_CREATED: "CREATE",
      SHAPE_DELETED: "DELETE",
      CONNECTION_DELETED: "DELETE",
    },
    errors,
  );

  expectChangedFieldForAction(
    action,
    change,
    {
      SHAPE_DISPLAY_TITLE_CHANGED: "displayTitle",
      SHAPE_POSITION_CHANGED: "position",
      CONNECTION_LABEL_CHANGED: "label",
    },
    errors,
  );

  const fullShapeCandidate =
    change?.operation === "DELETE" ? change.before : change?.snapshot;
  if (entityType === "canvas_shape" && isPlainObject(fullShapeCandidate)) {
    validateCanvasShapeSnapshot(
      fullShapeCandidate,
      "payload.change.snapshot",
      errors,
    );
  }

  const fullConnectionCandidate =
    change?.operation === "DELETE" ? change.before : change?.snapshot;
  if (
    entityType === "canvas_connection" &&
    isPlainObject(fullConnectionCandidate)
  ) {
    validateCanvasConnectionSnapshot(
      fullConnectionCandidate,
      "payload.change.snapshot",
      errors,
    );
  }
}

function validateCanvasShapeSnapshot(
  snapshot: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  requireNonEmptyString(snapshot, "shapeId", errors, path);
  requireNonEmptyString(snapshot, "boardId", errors, path);
  requireNonEmptyString(snapshot, "displayTitle", errors, path);

  if (
    typeof snapshot.shapeType !== "string" ||
    !CANVAS_ENTITY_TYPE_SET.has(snapshot.shapeType)
  ) {
    errors.push(`${path}.shapeType must be a Canvas entity type`);
  }

  if (
    typeof snapshot.entityType !== "string" ||
    !CANVAS_ENTITY_TYPE_SET.has(snapshot.entityType)
  ) {
    errors.push(`${path}.entityType must be a Canvas entity type`);
  }

  requireNonEmptyString(snapshot, "entityId", errors, path);
  optionalPosition(snapshot.position, `${path}.position`, errors);
}

function validateCanvasConnectionSnapshot(
  snapshot: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  requireNonEmptyString(snapshot, "connectionId", errors, path);
  requireNonEmptyString(snapshot, "boardId", errors, path);
  requireNonEmptyString(snapshot, "sourceShapeId", errors, path);
  requireNonEmptyString(snapshot, "targetShapeId", errors, path);
  requireNonEmptyString(snapshot, "connectionType", errors, path);
  requireStringOrNull(snapshot, "label", errors, path);
}

function validateTaskPayload(
  payload: Record<string, unknown>,
  errors: string[],
): void {
  const action = String(payload.action);
  const change = asObject(payload.change);

  expectOperationForAction(
    action,
    change?.operation,
    {
      TASK_CREATED: "CREATE",
      TASK_DELETED: "DELETE",
    },
    errors,
  );

  expectChangedFieldForAction(
    action,
    change,
    {
      TASK_STATUS_CHANGED: "status",
      TASK_ASSIGNEE_CHANGED: "assigneeMemberId",
      TASK_DESCRIPTION_CHANGED: "descriptionExcerpt",
      TASK_DUE_DATE_CHANGED: "dueDate",
      TASK_PRIORITY_CHANGED: "priority",
    },
    errors,
  );

  const snapshot =
    change?.operation === "DELETE" ? change.before : change?.snapshot;
  if (isPlainObject(snapshot)) {
    requireNonEmptyString(
      snapshot,
      "taskId",
      errors,
      "payload.change.snapshot",
    );
    requireNonEmptyString(snapshot, "title", errors, "payload.change.snapshot");
    requireNonEmptyString(
      snapshot,
      "status",
      errors,
      "payload.change.snapshot",
    );
    requireStringOrNull(
      snapshot,
      "assigneeMemberId",
      errors,
      "payload.change.snapshot",
    );
  }
}

function validateGithubPayload(
  payload: Record<string, unknown>,
  errors: string[],
): void {
  const action = String(payload.action);
  const change = asObject(payload.change);
  const snapshot =
    change?.operation === "DELETE" ? change.before : change?.snapshot;

  expectOperationForAction(
    action,
    change?.operation,
    {
      PR_COMMENT_CREATED: "CREATE",
      ISSUE_COMMENT_CREATED: "CREATE",
    },
    errors,
  );

  if (!isPlainObject(snapshot)) return;

  if (snapshot.provider !== "github") {
    errors.push("payload.change.snapshot.provider must be github");
  }

  requireNonEmptyString(
    snapshot,
    "repositoryId",
    errors,
    "payload.change.snapshot",
  );
  requireNonEmptyString(
    snapshot,
    "repositoryFullName",
    errors,
    "payload.change.snapshot",
  );
  requireNonEmptyString(snapshot, "url", errors, "payload.change.snapshot");

  if (action.startsWith("PR_")) {
    requireNonEmptyString(
      snapshot,
      "pullRequestId",
      errors,
      "payload.change.snapshot",
    );
  }

  if (action.startsWith("ISSUE_")) {
    requireNonEmptyString(
      snapshot,
      "issueId",
      errors,
      "payload.change.snapshot",
    );
  }

  if (action.includes("COMMENT_CREATED")) {
    requireNonEmptyString(
      snapshot,
      "commentId",
      errors,
      "payload.change.snapshot",
    );
    requireNonEmptyString(
      snapshot,
      "bodyExcerpt",
      errors,
      "payload.change.snapshot",
    );
  }
}

function validateChatPayload(
  payload: Record<string, unknown>,
  errors: string[],
): void {
  const action = String(payload.action);
  const change = asObject(payload.change);

  expectOperationForAction(
    action,
    change?.operation,
    {
      MESSAGE_SENT: "CREATE",
      MESSAGE_EDITED: "UPDATE",
      MESSAGE_DELETED: "DELETE",
    },
    errors,
  );

  const snapshot =
    change?.operation === "DELETE" ? change.before : change?.snapshot;
  if (!isPlainObject(snapshot)) return;

  requireNonEmptyString(
    snapshot,
    "messageId",
    errors,
    "payload.change.snapshot",
  );
  requireStringOrNull(snapshot, "threadId", errors, "payload.change.snapshot");

  if (action === "MESSAGE_SENT" || action === "MESSAGE_EDITED") {
    requireNonEmptyString(snapshot, "body", errors, "payload.change.snapshot");
  } else {
    requireStringOrNull(snapshot, "body", errors, "payload.change.snapshot");
  }

  if (!Array.isArray(snapshot.mentions)) {
    errors.push("payload.change.snapshot.mentions must be an array");
  }
}

function validateVoiceRoomPayload(
  payload: Record<string, unknown>,
  errors: string[],
): void {
  const action = String(payload.action);
  const change = asObject(payload.change);
  const snapshot = change?.snapshot;

  if (change?.operation !== "STATE") {
    errors.push("VOICE_ROOM actions require payload.change.operation = STATE");
  }

  if (!isPlainObject(snapshot)) return;

  requireNonEmptyString(
    snapshot,
    "voiceRoomId",
    errors,
    "payload.change.snapshot",
  );
  requireStringOrNull(
    snapshot,
    "voiceSessionId",
    errors,
    "payload.change.snapshot",
  );
  requireStringOrNull(snapshot, "memberId", errors, "payload.change.snapshot");
  requireStringOrNull(
    snapshot,
    "displayName",
    errors,
    "payload.change.snapshot",
  );

  if (
    typeof snapshot.microphoneState !== "string" ||
    !MICROPHONE_STATE_SET.has(snapshot.microphoneState)
  ) {
    errors.push(
      "payload.change.snapshot.microphoneState must be muted, unmuted, or unknown",
    );
  }

  if (typeof snapshot.speaking !== "boolean") {
    errors.push("payload.change.snapshot.speaking must be a boolean");
  }

  if (action === "MICROPHONE_MUTED" || action === "MICROPHONE_UNMUTED") {
    expectChangedFieldForAction(
      action,
      change,
      {
        MICROPHONE_MUTED: "microphoneState",
        MICROPHONE_UNMUTED: "microphoneState",
      },
      errors,
    );
  }

  if (action === "SPEAKING_STARTED" || action === "SPEAKING_STOPPED") {
    expectChangedFieldForAction(
      action,
      change,
      {
        SPEAKING_STARTED: "speaking",
        SPEAKING_STOPPED: "speaking",
      },
      errors,
    );
  }
}

function actionSetForEventType(
  eventType: Exclude<MeetingEventType, "NOTE" | "STT">,
): ReadonlySet<string> {
  if (eventType === "CANVAS") return CANVAS_ACTION_SET;
  if (eventType === "TASK") return TASK_ACTION_SET;
  if (eventType === "GITHUB") return GITHUB_ACTION_SET;
  if (eventType === "CHAT") return CHAT_ACTION_SET;
  return VOICE_ROOM_ACTION_SET;
}

function sourceDomainForEventType(
  eventType: Exclude<MeetingEventType, "NOTE" | "STT">,
): MeetingEventSourceDomain {
  if (eventType === "CANVAS") return "canvas";
  if (eventType === "TASK") return "task";
  if (eventType === "GITHUB") return "github";
  if (eventType === "CHAT") return "chat";
  return "voice_room";
}

function targetEntityTypesForEventType(
  eventType: Exclude<MeetingEventType, "NOTE" | "STT">,
): ReadonlySet<MeetingEventEntityType> {
  if (eventType === "CANVAS") {
    return new Set<MeetingEventEntityType>([
      "canvas_shape",
      "canvas_connection",
    ]);
  }

  if (eventType === "TASK") return new Set<MeetingEventEntityType>(["task"]);

  if (eventType === "GITHUB") {
    return new Set<MeetingEventEntityType>([
      "github_pull_request",
      "github_issue",
      "github_comment",
    ]);
  }

  if (eventType === "CHAT") {
    return new Set<MeetingEventEntityType>(["chat_message"]);
  }

  return new Set<MeetingEventEntityType>(["voice_room", "voice_session"]);
}

function expectOperationForAction(
  action: string,
  operation: unknown,
  expectedByAction: Record<string, MeetingEventChangeOperation>,
  errors: string[],
): void {
  const expected = expectedByAction[action];

  if (expected && operation !== expected) {
    errors.push(`${action} requires payload.change.operation = ${expected}`);
  }
}

function expectChangedFieldForAction(
  action: string,
  change: Record<string, unknown> | null,
  fieldByAction: Record<string, string>,
  errors: string[],
): void {
  const expectedField = fieldByAction[action];
  const changedFields = change?.changedFields;

  if (!expectedField) return;

  if (!Array.isArray(changedFields) || !changedFields.includes(expectedField)) {
    errors.push(`${action} requires changedFields to include ${expectedField}`);
  }
}

function assertNoDeprecatedCanvasKeys(
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoDeprecatedCanvasKeys(item, `${path}[${index}]`, errors),
    );
    return;
  }

  if (!isPlainObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (/^nodes?$|^nodeIds?$/i.test(key)) {
      errors.push(`${path}.${key} must use shape/connection terminology`);
    }

    assertNoDeprecatedCanvasKeys(child, `${path}.${key}`, errors);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

function requireNonEmptyString(
  object: Record<string, unknown>,
  key: string,
  errors: string[],
  path = "payload",
): void {
  const value = object[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path}.${key} must be a non-empty string`);
  }
}

function optionalNonEmptyString(
  object: Record<string, unknown>,
  key: string,
  errors: string[],
): void {
  const value = object[key];
  if (
    value !== undefined &&
    (typeof value !== "string" || value.trim().length === 0)
  ) {
    errors.push(`payload.source.${key} must be a non-empty string`);
  }
}

function requireStringOrNull(
  object: Record<string, unknown>,
  key: string,
  errors: string[],
  path = "payload",
): void {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    errors.push(`${path}.${key} is required`);
    return;
  }

  const value = object[key];
  if (value !== null && typeof value !== "string") {
    errors.push(`${path}.${key} must be a string or null`);
  }
}

function requireIsoDateTime(
  object: Record<string, unknown>,
  key: string,
  errors: string[],
): void {
  const value = object[key];
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    errors.push(`payload.${key} must be an ISO date-time string`);
  }
}

function requireNull(value: unknown, path: string, errors: string[]): void {
  if (value !== null) {
    errors.push(`${path} must be null`);
  }
}

function requireObject(value: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
  }
}

function requireObjectOrNull(
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (value !== null && !isPlainObject(value)) {
    errors.push(`${path} must be an object or null`);
  }
}

function optionalPosition(
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (value === undefined) return;

  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  if (typeof value.x !== "number" || !Number.isFinite(value.x)) {
    errors.push(`${path}.x must be a finite number`);
  }

  if (typeof value.y !== "number" || !Number.isFinite(value.y)) {
    errors.push(`${path}.y must be a finite number`);
  }
}
