import { defaultAppServerUrl } from "../api/apiUrl.mjs";

export const WORKSPACE_AI_CHAT_WORKFLOW_TYPE = "orchestrator.run";
export const CANVAS_MEMO_ACTION_TYPE = "canvas.memo.create";

const DEFAULT_WORKSPACE_AI_CHAT_MODE = "mock";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstText(...values) {
  for (const value of values) {
    const text = nonEmptyText(value);
    if (text) return text;
  }

  return null;
}

function compactRecord(value) {
  if (!isRecord(value)) return null;

  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}

function normalizePosition(value) {
  if (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  ) {
    return {
      x: value.x,
      y: value.y,
    };
  }

  return null;
}

function fallbackMemoTitle(text) {
  const normalizedText = nonEmptyText(text) ?? "AI 메모";
  const firstLine = normalizedText.split(/\r?\n/).find(Boolean) ?? normalizedText;

  return firstLine.length > 42 ? `${firstLine.slice(0, 39)}...` : firstLine;
}

function defaultCreatedAt() {
  return new Date().toISOString();
}

function normalizeIntentText(message) {
  return String(message ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function defaultWorkspaceAiChatAgentMode() {
  const explicitMode =
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_AI_CHAT_MODE ??
    process.env.NEXT_PUBLIC_PILO_AGENT_MODE;

  if (explicitMode) return explicitMode;
  if (defaultAppServerUrl()) return "api";

  return (
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ??
    DEFAULT_WORKSPACE_AI_CHAT_MODE
  );
}

export function resolveWorkspaceAiChatAgentMode(
  mode = defaultWorkspaceAiChatAgentMode(),
) {
  return mode === "api" ? "api" : "mock";
}

export function hasCanvasMemoMutationIntent(message = "") {
  const text = normalizeIntentText(message);

  if (!text) return false;

  const hasCanvasTarget =
    /(캔버스|프로젝트\s*맵|보드|canvas|project\s*map)/i.test(text);
  const hasMemoTarget =
    /(메모|노트|스티키|포스트잇|sticky|post[-\s]?it|note)/i.test(text);
  const hasMutationVerb =
    /(추가|만들|생성|남겨|남기|작성|적어|써줘|써 줘|기록|붙여|등록|올려|메모해|메모로|노트로)/i.test(
      text,
    );

  return hasCanvasTarget && hasMemoTarget && hasMutationVerb;
}

export function buildWorkspaceAiChatFallbackAnswer({
  message = "",
  reason = "",
} = {}) {
  const sourceQuestion = nonEmptyText(message);
  const prefix = nonEmptyText(reason) ? `${reason}\n\n` : "";
  const questionLine = sourceQuestion
    ? `\n\n판단 기준\n"${sourceQuestion}" 질문은 캔버스 변경 요청이 아니라 조회형 요청으로 처리했습니다.`
    : "";

  return `${prefix}지금은 저장 작업 없이 참고 답변만 드릴게요.

우선순위 제안
1. 회의 결정사항 중 마감이 있거나 다른 작업을 막는 항목을 먼저 확인하세요.
2. 오늘 바로 착수 가능한 담당 작업을 분리하고 필요한 자료나 승인 여부를 점검하세요.
3. 불확실한 항목은 다음 회의 안건이나 담당자 확인 항목으로 남기세요.${questionLine}`;
}

/**
 * @param {object} input
 * @param {string} input.workspaceId
 * @param {string} input.message
 * @param {string | null} [input.boardId]
 * @param {Record<string, unknown> | null} [input.currentUser]
 * @param {Record<string, unknown> | null} [input.currentMember]
 */
export function buildWorkspaceAiChatRequest({
  workspaceId,
  message,
  boardId = null,
  currentUser = null,
  currentMember = null,
} = {}) {
  return {
    message,
    workflowType: WORKSPACE_AI_CHAT_WORKFLOW_TYPE,
    contextRefs: [
      { type: "workspace", id: workspaceId },
      ...(boardId ? [{ type: "canvas_board", id: boardId }] : []),
    ],
    currentUserContext: compactRecord(currentUser),
    currentMemberContext: compactRecord(currentMember),
    currentDateKst: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  };
}

/**
 * @param {Record<string, unknown>} action
 * @param {object} context
 * @param {string} context.workspaceId
 * @param {string | null} [context.boardId]
 * @param {string} [context.message]
 * @param {Record<string, unknown> | null} [context.currentUser]
 * @param {Record<string, unknown> | null} [context.currentMember]
 * @param {"api" | "local_fallback"} [context.source]
 */
export function normalizeCanvasMemoProposal(
  action,
  {
    workspaceId,
    boardId = null,
    message = "",
    currentUser = null,
    currentMember = null,
    source = "api",
  } = {},
) {
  if (!isRecord(action) || action.type !== CANVAS_MEMO_ACTION_TYPE) {
    return null;
  }

  const payload = isRecord(action.payload) ? action.payload : {};
  const text =
    firstText(payload.text, payload.body, payload.content, payload.description) ??
    firstText(payload.displayTitle, payload.title, message) ??
    "AI가 만든 메모";
  const authorId =
    firstText(payload.authorId, payload.createdByMemberId) ??
    firstText(currentMember?.memberId, currentUser?.id) ??
    null;
  const authorName =
    firstText(payload.authorName, payload.createdByName) ??
    firstText(currentMember?.name, currentMember?.displayName, currentUser?.name) ??
    "Guest";

  return {
    id: action.id ?? `local-canvas-memo-action-${Date.now()}`,
    actionId: action.id ?? null,
    type: CANVAS_MEMO_ACTION_TYPE,
    source,
    status: action.status ?? "waiting_confirmation",
    summary:
      firstText(action.summary, payload.summary) ??
      "승인하면 캔버스 보드에 메모를 추가합니다.",
    payload: {
      workspaceId: firstText(payload.workspaceId) ?? workspaceId,
      boardId: firstText(payload.boardId) ?? boardId,
      text,
      title: firstText(payload.title, payload.displayTitle) ?? fallbackMemoTitle(text),
      position: normalizePosition(payload.position),
      authorId,
      authorName,
      createdAt: firstText(payload.createdAt) ?? defaultCreatedAt(),
      color: firstText(payload.color) ?? "#f4c950",
    },
  };
}

/**
 * @param {Record<string, unknown>} result
 * @param {object} context
 * @param {string} context.workspaceId
 * @param {string | null} [context.boardId]
 * @param {string} [context.message]
 * @param {Record<string, unknown> | null} [context.currentUser]
 * @param {Record<string, unknown> | null} [context.currentMember]
 */
export function findCanvasMemoProposal(
  result,
  {
    workspaceId,
    boardId = null,
    message = "",
    currentUser = null,
    currentMember = null,
  } = {},
) {
  const run = result?.run;
  const actions = Array.isArray(run?.actions) ? run.actions : [];

  for (const action of actions) {
    const proposal = normalizeCanvasMemoProposal(action, {
      workspaceId,
      boardId,
      message,
      currentUser,
      currentMember,
      source: "api",
    });

    if (proposal) return proposal;
  }

  return null;
}

/**
 * @param {object} input
 * @param {string} input.workspaceId
 * @param {string | null} [input.boardId]
 * @param {string} [input.message]
 * @param {Record<string, unknown> | null} [input.currentUser]
 * @param {Record<string, unknown> | null} [input.currentMember]
 * @param {string} [input.reason]
 */
export function buildLocalCanvasMemoProposal({
  workspaceId,
  boardId = null,
  message = "",
  currentUser = null,
  currentMember = null,
  reason = "현재 런타임 응답에 canvas.memo.create가 없어 로컬 확인 제안으로 준비했습니다.",
} = {}) {
  const text = nonEmptyText(message) ?? "AI가 만든 캔버스 메모";
  const authorId =
    firstText(currentMember?.memberId, currentUser?.id) ?? "guest";
  const authorName =
    firstText(currentMember?.name, currentMember?.displayName, currentUser?.name) ??
    "Guest";

  return {
    id: `local-canvas-memo-action-${Date.now()}`,
    actionId: null,
    type: CANVAS_MEMO_ACTION_TYPE,
    source: "local_fallback",
    status: "waiting_confirmation",
    summary: reason,
    payload: {
      workspaceId,
      boardId,
      text,
      title: fallbackMemoTitle(text),
      position: null,
      authorId,
      authorName,
      createdAt: defaultCreatedAt(),
      color: "#f4c950",
    },
  };
}

export function workspaceAiChatUserMessageFromError(error) {
  if (error?.status === 401) {
    return "AI 채팅을 사용하려면 로그인/세션이 필요합니다.";
  }

  return "AI 채팅 응답을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
