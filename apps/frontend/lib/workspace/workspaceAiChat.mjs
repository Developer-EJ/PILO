import { defaultAppServerUrl } from "../api/apiUrl.mjs";

export const WORKSPACE_AI_CHAT_WORKFLOW_TYPE = "orchestrator.run";
export const CANVAS_MEMO_ACTION_TYPE = "canvas.memo.create";
export const TASK_CREATE_DRAFT_ACTION_TYPE = "task.create.draft";
export const TASK_UPDATE_STATUS_ACTION_TYPE = "task.update.status";

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

function extractQuotedMemoText(message) {
  const text = nonEmptyText(message);
  if (!text) return null;

  const quoted =
    text.match(/'([^']{2,})'/) ??
    text.match(/"([^"]{2,})"/) ??
    text.match(/“([^”]{2,})”/) ??
    text.match(/‘([^’]{2,})’/) ??
    text.match(/`([^`]{2,})`/);

  return nonEmptyText(quoted?.[1]);
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

function toTextArray(value, limit = 3) {
  if (!Array.isArray(value)) return [];

  return value.map((item) => nonEmptyText(item)).filter(Boolean).slice(0, limit);
}

function listRuntimeActions(result) {
  const candidates = [
    result?.run?.actions,
    result?.actions,
    result?.response?.actionProposals,
    result?.run?.output?.actionProposals,
  ];
  const actions = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;

    for (const action of candidate) {
      if (!isRecord(action)) continue;
      const fingerprint = [
        nonEmptyText(action.id) ?? "",
        nonEmptyText(action.type) ?? "",
        JSON.stringify(action.payload ?? {}),
      ].join("|");

      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      actions.push(action);
    }
  }

  return actions;
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

export function hasTaskDraftMutationIntent(message = "") {
  const text = normalizeIntentText(message);

  if (!text) return false;

  const hasTaskTarget = /(task|할\s*일|작업|업무|todo|티켓|이슈)/i.test(text);
  const hasDraftTarget = /(초안|draft|후보)/i.test(text);
  const hasCreateVerb =
    /(추가|만들|만들어|생성|등록|작성|써줘|써 줘|잡아|올려|create|add|make|write)/i.test(
      text,
    );

  return (hasTaskTarget || hasDraftTarget) && hasCreateVerb;
}

function stripTaskSentence(value) {
  return nonEmptyText(
    String(value ?? "")
      .replace(/[.。]+$/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function extractTaskDescription(message = "") {
  const text = String(message ?? "");
  const match = text.match(
    /설명(?:은|:)?\s*([\s\S]*?)(?:이고\s*담당|이며\s*담당|,\s*담당|\.|$)/i,
  );

  return stripTaskSentence(match?.[1]) ?? null;
}

function extractTaskAssigneeName(message = "") {
  const text = String(message ?? "");
  const match = text.match(
    /담당(?:자)?(?:는|은|:)?\s*([A-Za-z가-힣0-9 _-]+?)(?:으로|로|에게|한테|가|이|\.|,|$)/i,
  );

  return stripTaskSentence(match?.[1]) ?? null;
}

function extractTaskTitle(message = "") {
  const text = String(message ?? "")
    .replace(/설명(?:은|:)?[\s\S]*$/i, "")
    .trim();
  const match = text.match(
    /(.+?)\s*(?:작업\s*(?:하나|한\s*개|1개)?\s*)?(?:만들어|만들|생성|추가|등록|작성|create|add|make|write)/i,
  );
  const candidate = stripTaskSentence(match?.[1]) ?? stripTaskSentence(text);
  const title = stripTaskSentence(
    candidate?.replace(/\s*(?:작업\s*(?:하나|한\s*개|1개)?)$/i, ""),
  );

  return title ?? "새 작업";
}

function extractTaskPriority(message = "") {
  const text = normalizeIntentText(message);

  if (/긴급|urgent/.test(text)) return "urgent";
  if (/높|high/.test(text)) return "high";
  if (/낮|low/.test(text)) return "low";

  return "medium";
}

function normalizeMemberLookupText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function findMemberByName(members = [], name = "") {
  const target = normalizeMemberLookupText(name);
  if (!target || !Array.isArray(members)) return null;

  return (
    members.find((member) => {
      if (!isRecord(member)) return false;
      const candidates = [
        member.memberId,
        member.userId,
        member.name,
        member.displayName,
        member.email,
      ].map(normalizeMemberLookupText);

      return candidates.some(
        (candidate) =>
          candidate === target ||
          (candidate.length > 0 && candidate.includes(target)) ||
          (candidate.length > 0 && target.length > 0 && target.includes(candidate)),
      );
    }) ?? null
  );
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

export function buildWorkspaceAiChatAssistantText(result) {
  const response = isRecord(result?.response)
    ? result.response
    : isRecord(result?.run?.output)
      ? result.run.output
      : null;
  const conclusion = firstText(response?.shortConclusion);

  if (conclusion) {
    const priorityTasks = toTextArray(response?.priorityTasks, 3);
    const nextActions = toTextArray(response?.recommendedNextActions, 3);
    const actionCount = listRuntimeActions(result).length;
    const lines = [conclusion];

    if (priorityTasks.length > 0) {
      lines.push("", "우선 처리할 일");
      lines.push(...priorityTasks.map((item) => `- ${item}`));
    }

    if (nextActions.length > 0) {
      lines.push("", "다음 행동");
      lines.push(...nextActions.map((item) => `- ${item}`));
    }

    if (actionCount > 0) {
      lines.push("", `승인 대기 제안 ${actionCount}개가 준비됐습니다.`);
    }

    return lines.join("\n");
  }

  return (
    firstText(result?.assistantMessage?.body) ??
    (result?.message?.role === "assistant"
      ? firstText(result.message.body)
      : null) ??
    firstText(result?.run?.output?.summary) ??
    ""
  );
}

export function extractWorkspaceAiChatRuntimeInfo(result, { mode = "mock" } = {}) {
  const response = isRecord(result?.response)
    ? result.response
    : isRecord(result?.run?.output)
      ? result.run.output
      : null;
  const fallback =
    typeof response?.fallback === "boolean"
      ? response.fallback
      : mode !== "api";
  const usedModel =
    firstText(response?.usedModel, result?.run?.tokenUsage?.model) ?? null;
  const generatedAt =
    firstText(response?.runtime?.generatedAt, result?.run?.updatedAt) ?? null;
  const sourceStatus = isRecord(response?.runtime?.sourceStatus)
    ? response.runtime.sourceStatus
    : null;

  return {
    mode: mode === "api" ? "api" : "mock",
    fallback,
    usedModel,
    generatedAt,
    sourceStatus,
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
  for (const action of listRuntimeActions(result)) {
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

export function normalizeTaskActionProposal(
  action,
  { workspaceId, message = "", source = "api", members = [] } = {},
) {
  if (
    !isRecord(action) ||
    (action.type !== TASK_CREATE_DRAFT_ACTION_TYPE &&
      action.type !== TASK_UPDATE_STATUS_ACTION_TYPE)
  ) {
    return null;
  }

  const payload = isRecord(action.payload) ? action.payload : {};
  const assigneeName =
    firstText(payload.assigneeName, payload.assignee, payload.ownerName) ??
    extractTaskAssigneeName(message);
  const assigneeMember = findMemberByName(members, assigneeName);
  const title =
    firstText(payload.title, payload.taskHint, payload.displayTitle) ??
    extractTaskTitle(message) ??
    "Task 실행 제안";
  const description =
    firstText(payload.description, payload.summary, action.summary) ??
    extractTaskDescription(message) ??
    "AI 채팅에서 요청한 작업입니다.";
  const isDraftCreate = action.type === TASK_CREATE_DRAFT_ACTION_TYPE;

  return {
    id: action.id ?? `task-action-${Date.now()}`,
    actionId: action.id ?? null,
    type: action.type,
    source,
    status: action.status ?? "waiting_confirmation",
    summary:
      firstText(action.summary) ??
      "확인하면 작업 초안을 만들고 승인해 작업 보드에 추가합니다.",
    executable: isDraftCreate,
    contractNote:
      isDraftCreate
        ? "확인하면 Task 담당 client로 작업 초안을 생성한 뒤 승인합니다."
        : "상태 변경 action은 추가 Task 계약이 필요합니다.",
    payload: {
      workspaceId: firstText(payload.workspaceId) ?? workspaceId,
      title,
      description,
      priority: firstText(payload.priority) ?? extractTaskPriority(message),
      dueDate: firstText(payload.dueDate) ?? null,
      status: firstText(payload.status) ?? null,
      assigneeMemberId:
        firstText(payload.assigneeMemberId) ??
        firstText(assigneeMember?.memberId) ??
        (source === "local_fallback" ? assigneeName : null),
      assigneeName,
      sourceType: firstText(payload.sourceType) ?? "ai_chat",
      sourceId:
        firstText(payload.sourceId) ??
        action.id ??
        `workspace-ai-chat-${Date.now()}`,
    },
  };
}

export function findWorkspaceTaskActionProposal(
  result,
  { workspaceId, message = "", members = [] } = {},
) {
  if (!hasTaskDraftMutationIntent(message)) return null;

  for (const action of listRuntimeActions(result)) {
    const proposal = normalizeTaskActionProposal(action, {
      workspaceId,
      message,
      source: "api",
      members,
    });

    if (proposal) return proposal;
  }

  return buildLocalTaskDraftProposal({ workspaceId, message, members });
}

export function buildLocalTaskDraftProposal({
  workspaceId,
  message = "",
  members = [],
  reason = "현재 런타임 응답에 task.create.draft가 없어 로컬 확인 제안으로 준비했습니다.",
} = {}) {
  if (!hasTaskDraftMutationIntent(message)) return null;

  return normalizeTaskActionProposal(
    {
      id: `local-task-draft-action-${Date.now()}`,
      type: TASK_CREATE_DRAFT_ACTION_TYPE,
      status: "waiting_confirmation",
      summary: reason,
      payload: {
        workspaceId,
        title: extractTaskTitle(message),
        description: extractTaskDescription(message) ?? "AI 채팅에서 요청한 작업입니다.",
        assigneeName: extractTaskAssigneeName(message),
        priority: extractTaskPriority(message),
        sourceType: "ai_chat",
      },
    },
    {
      workspaceId,
      message,
      source: "local_fallback",
      members,
    },
  );
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
  const text =
    extractQuotedMemoText(message) ??
    nonEmptyText(message) ??
    "AI가 만든 캔버스 메모";
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
