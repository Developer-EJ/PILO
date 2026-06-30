"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { createAgentClient } from "../../lib/agent/agentClient.mjs";
import { createAuthClient } from "../../lib/auth/authClient.mjs";
import { createCanvasMemo } from "../../lib/workspace/canvasClient.mjs";
import { createWorkspaceClient } from "../../lib/workspace/workspaceClient.mjs";
import {
  buildLocalCanvasMemoProposal,
  buildWorkspaceAiChatFallbackAnswer,
  buildWorkspaceAiChatRequest,
  findCanvasMemoProposal,
  hasCanvasMemoMutationIntent,
  resolveWorkspaceAiChatAgentMode,
  workspaceAiChatUserMessageFromError,
} from "../../lib/workspace/workspaceAiChat.mjs";

type WorkspaceAiChatProps = {
  workspaceId: string | null;
  initialBoardId?: string | null;
  onCanvasMemoCreated?: (result: CanvasMemoCreateResult) => void;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
};

type CanvasMemoProposal = {
  id: string;
  actionId: string | null;
  type: "canvas.memo.create";
  source: "api" | "local_fallback";
  status: string;
  summary: string;
  payload: {
    workspaceId: string;
    boardId: string | null;
    text: string;
    title: string;
    position: { x: number; y: number } | null;
    authorId: string | null;
    authorName: string;
    createdAt: string;
    color: string;
  };
};

type CanvasMemoCreateResult = {
  boardId: string;
  boardTitle: string;
  href: string;
  shape: {
    id?: string;
    entityType: string;
    entityId: string;
    displayTitle: string;
    shapeType: string;
    width?: number;
    height?: number;
    color?: string;
    body?: string;
    authorId?: string | null;
    authorName?: string | null;
    createdByMemberId?: string | null;
    createdAt?: string;
    updatedAt?: string;
    position?: {
      x: number;
      y: number;
    };
  };
};

type RuntimeUser = {
  id?: string;
  name?: string;
  email?: string;
};

type RuntimeMember = {
  memberId?: string;
  userId?: string;
  name?: string;
  displayName?: string;
  email?: string;
  role?: string;
};

type ChatStatus =
  | "idle"
  | "loading"
  | "ready"
  | "fallback"
  | "executing"
  | "executed"
  | "error";

const initialMessages: ChatMessage[] = [
  {
    id: "workspace-ai-welcome",
    role: "assistant",
    body: "회의록, 작업, 리뷰, 캔버스에 대해 물어보세요. 캔버스 변경 요청은 실행 전에 확인 카드로 먼저 보여드릴게요.",
  },
];

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function statusLabel(status: ChatStatus, proposal: CanvasMemoProposal | null) {
  if (status === "loading") return "답변 생성 중";
  if (status === "executing") return "메모 생성 중";
  if (status === "executed") return "생성 완료";
  if (status === "fallback") return proposal ? "로컬 제안" : "참고 답변";
  if (proposal?.source === "local_fallback") return "로컬 제안";
  if (status === "error") return "확인 필요";
  if (proposal) return "확인 대기";

  return "대기";
}

function summarizeText(text: string) {
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function errorStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null;
  }

  const status = Number((error as { status?: unknown }).status);

  return Number.isFinite(status) ? status : null;
}

export function WorkspaceAiChat({
  workspaceId,
  initialBoardId = null,
  onCanvasMemoCreated,
}: WorkspaceAiChatProps) {
  const agentMode = useMemo(() => resolveWorkspaceAiChatAgentMode(), []);
  const agentClient = useMemo(
    () => createAgentClient({ mode: agentMode }),
    [agentMode],
  );
  const authClient = useMemo(() => createAuthClient(), []);
  const workspaceClient = useMemo(() => createWorkspaceClient(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<CanvasMemoProposal | null>(null);
  const [createdMemo, setCreatedMemo] =
    useState<CanvasMemoCreateResult | null>(null);
  const [currentUser, setCurrentUser] = useState<RuntimeUser | null>(null);
  const [currentMember, setCurrentMember] = useState<RuntimeMember | null>(
    null,
  );

  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;

    async function loadContext() {
      const user = await authClient.getCurrentUser().catch(() => null);
      const members = await workspaceClient
        .listWorkspaceMembers(workspaceId)
        .catch(() => []);
      const member = Array.isArray(members)
        ? members.find((item) => item.userId && item.userId === user?.id) ??
          members[0] ??
          null
        : null;

      if (cancelled) return;
      setCurrentUser(user);
      setCurrentMember(member);
    }

    void loadContext();

    return () => {
      cancelled = true;
    };
  }, [authClient, workspaceClient, workspaceId]);

  if (!workspaceId) {
    return null;
  }

  const resolvedWorkspaceId = workspaceId;

  async function submitMessage() {
    const message = input.trim();

    if (!message || status === "loading" || status === "executing") return;

    const hasMemoMutationIntent = hasCanvasMemoMutationIntent(message);

    setInput("");
    setError("");
    setCreatedMemo(null);
    setProposal(null);
    setStatus("loading");
    setMessages((current) => [
      ...current,
      {
        id: createLocalId("workspace-ai-user"),
        role: "user",
        body: message,
      },
    ]);

    try {
      const result = await agentClient.sendChatMessage(
        resolvedWorkspaceId,
        buildWorkspaceAiChatRequest({
          workspaceId: resolvedWorkspaceId,
          message,
          boardId: initialBoardId,
          currentUser,
          currentMember,
        }),
      );
      const apiProposal = findCanvasMemoProposal(result, {
        workspaceId: resolvedWorkspaceId,
        boardId: initialBoardId,
        message,
        currentUser,
        currentMember,
      }) as CanvasMemoProposal | null;
      const localProposal =
        !apiProposal && hasMemoMutationIntent
          ? (buildLocalCanvasMemoProposal({
              workspaceId: resolvedWorkspaceId,
              boardId: initialBoardId,
              message,
              currentUser,
              currentMember,
            }) as CanvasMemoProposal)
          : null;
      const nextProposal = apiProposal ?? localProposal;
      const responseBody =
        result?.message?.body ?? result?.run?.output?.summary ?? "";
      const shouldShowRuntimeAnswer = agentMode === "api" && responseBody;
      const assistantBody = nextProposal
        ? apiProposal
          ? responseBody ||
            "실행 전 확인이 필요한 캔버스 메모 제안이 준비되었습니다."
          : `${
              responseBody ||
              "실행 전 확인이 필요한 캔버스 메모 제안이 준비되었습니다."
            }\n\n현재 런타임 응답에 canvas.memo.create가 없어 로컬 확인 제안으로 표시합니다.`
        : shouldShowRuntimeAnswer
          ? responseBody
          : buildWorkspaceAiChatFallbackAnswer({
              message,
              reason:
                agentMode === "mock"
                  ? "현재 워크스페이스 AI 채팅은 로컬 모드로 동작 중입니다."
                  : "",
            });

      setMessages((current) => [
        ...current,
        {
          id: createLocalId("workspace-ai-assistant"),
          role: "assistant",
          body: assistantBody,
        },
      ]);
      setProposal(nextProposal);
      setStatus(nextProposal ? (apiProposal ? "ready" : "fallback") : "ready");
    } catch (caughtError) {
      const userMessage = workspaceAiChatUserMessageFromError(caughtError);
      const fallbackProposal = hasMemoMutationIntent
        ? (buildLocalCanvasMemoProposal({
            workspaceId: resolvedWorkspaceId,
            boardId: initialBoardId,
            message,
            currentUser,
            currentMember,
            reason:
              "AI 채팅 API 연결이 원활하지 않아 로컬 확인 제안으로 준비했습니다.",
          }) as CanvasMemoProposal)
        : null;
      const assistantBody = fallbackProposal
        ? userMessage
        : buildWorkspaceAiChatFallbackAnswer({
            message,
            reason: userMessage,
          });
      const statusCode = errorStatus(caughtError);

      setError(fallbackProposal || statusCode !== 401 ? "" : userMessage);
      setMessages((current) => [
        ...current,
        {
          id: createLocalId("workspace-ai-assistant"),
          role: "assistant",
          body: assistantBody,
        },
      ]);
      setProposal(fallbackProposal);
      setStatus(fallbackProposal ? "fallback" : statusCode === 401 ? "error" : "fallback");
    }
  }

  async function confirmProposal() {
    if (!proposal || status === "executing") return;

    setStatus("executing");
    setError("");

    try {
      const result = (await createCanvasMemo({
        workspaceId: proposal.payload.workspaceId || resolvedWorkspaceId,
        boardId: proposal.payload.boardId || initialBoardId,
        text: proposal.payload.text,
        title: proposal.payload.title,
        position: proposal.payload.position,
        authorId: proposal.payload.authorId ?? undefined,
        authorName: proposal.payload.authorName,
        createdAt: proposal.payload.createdAt,
        color: proposal.payload.color,
      })) as CanvasMemoCreateResult;

      if (proposal.actionId) {
        await agentClient.approveAction(proposal.actionId).catch(() => null);
      }

      setCreatedMemo(result);
      setProposal(null);
      setMessages((current) => [
        ...current,
        {
          id: createLocalId("workspace-ai-assistant"),
          role: "assistant",
          body: `"${proposal.payload.title}" 메모를 캔버스에 만들었어요.`,
        },
      ]);
      onCanvasMemoCreated?.(result);
      setStatus("executed");
    } catch {
      setError(
        "캔버스에 메모를 생성하지 못했어요. 서버 연결과 권한을 확인해 주세요.",
      );
      setStatus("error");
    }
  }

  function rejectProposal() {
    if (!proposal) return;

    if (proposal.actionId) {
      void agentClient.rejectAction(proposal.actionId).catch(() => null);
    }

    setProposal(null);
    setStatus("idle");
    setMessages((current) => [
      ...current,
      {
        id: createLocalId("workspace-ai-assistant"),
        role: "assistant",
        body: "제안을 취소했어요. 다른 메모가 필요하면 다시 요청해 주세요.",
      },
    ]);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    void submitMessage();
  }

  return (
    <aside
      className={isOpen ? "workspace-ai-chat is-open" : "workspace-ai-chat"}
      aria-label="워크스페이스 AI 채팅"
    >
      {isOpen ? (
        <section className="workspace-ai-chat-panel">
          <header>
            <div>
              <span>AI 채팅</span>
              <strong>캔버스 메모 실행</strong>
            </div>
            <button
              type="button"
              aria-label="AI 채팅 닫기"
              onClick={() => setIsOpen(false)}
            >
              닫기
            </button>
          </header>

          <div className="workspace-ai-chat-status">
            <span>{statusLabel(status, proposal)}</span>
            {currentMember?.name || currentUser?.name ? (
              <small>{currentMember?.name ?? currentUser?.name}</small>
            ) : (
              <small>Guest</small>
            )}
          </div>

          <div className="workspace-ai-chat-messages" aria-live="polite">
            {messages.map((message) => (
              <article
                className={
                  message.role === "user"
                    ? "workspace-ai-message is-user"
                    : "workspace-ai-message"
                }
                key={message.id}
              >
                <span>{message.role === "user" ? "나" : "AI"}</span>
                <p>{message.body}</p>
              </article>
            ))}
          </div>

          {proposal ? (
            <article className="workspace-ai-action-card">
              <div>
                <span>
                  {proposal.source === "api" ? "API 제안" : "로컬 제안"}
                </span>
                <strong>{proposal.payload.title}</strong>
              </div>
              <p>{summarizeText(proposal.payload.text)}</p>
              <dl>
                <div>
                  <dt>작성자</dt>
                  <dd>{proposal.payload.authorName}</dd>
                </div>
                <div>
                  <dt>생성 시각</dt>
                  <dd>{proposal.payload.createdAt}</dd>
                </div>
              </dl>
              <small>{proposal.summary}</small>
              <div className="workspace-ai-action-row">
                <button
                  type="button"
                  disabled={status === "executing"}
                  onClick={() => void confirmProposal()}
                >
                  메모 만들기
                </button>
                <button
                  type="button"
                  disabled={status === "executing"}
                  onClick={rejectProposal}
                >
                  취소
                </button>
              </div>
            </article>
          ) : null}

          {createdMemo ? (
            <div className="workspace-ai-created">
              <span>{createdMemo.boardTitle}에 메모를 저장했어요.</span>
              <Link href={createdMemo.href}>캔버스에서 보기</Link>
            </div>
          ) : null}

          {error ? (
            <p className="workspace-ai-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="workspace-ai-chat-input">
            <textarea
              aria-label="AI 채팅 메시지"
              placeholder="예: 캔버스에 오늘 리스크를 메모로 남겨줘"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
            />
            <button
              type="button"
              disabled={!input.trim() || status === "loading"}
              onClick={() => void submitMessage()}
            >
              전송
            </button>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className="workspace-ai-chat-toggle"
        aria-expanded={isOpen}
        aria-label={isOpen ? "AI 채팅 닫기" : "AI 채팅 열기"}
        onClick={() => setIsOpen((current) => !current)}
      >
        AI
      </button>
    </aside>
  );
}
