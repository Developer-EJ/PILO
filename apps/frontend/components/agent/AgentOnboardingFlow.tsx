"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  agentOnboardingFieldLabels,
  agentOnboardingRequiredFields,
  buildFallbackOnboardingTurn,
  buildWorkspaceCreationPayload,
  createAgentOnboardingClient,
  missingOnboardingFields,
  normalizeOnboardingDraft,
} from "../../lib/agent/agentOnboardingClient.mjs";
import styles from "./agent-workspace.module.css";

type AgentOnboardingFieldKey =
  | "workspaceTitle"
  | "goal"
  | "problem"
  | "targetUser"
  | "duration"
  | "teamSize"
  | "experienceLevel"
  | "outputGoal";

type AgentOnboardingDraft = Record<
  AgentOnboardingFieldKey,
  string | number | null
>;

type AgentOnboardingMessage = {
  id?: string;
  role: "user" | "assistant";
  body: string;
  fieldKey?: AgentOnboardingFieldKey | null;
};

type AgentOnboardingTurnResult = {
  reply: string;
  draft: AgentOnboardingDraft;
  missingFields: AgentOnboardingFieldKey[];
  ready: boolean;
  fieldInFocus: AgentOnboardingFieldKey | null;
  summary: string | null;
  planningSeed: AgentOnboardingDraft | null;
  taskCandidates: Array<Record<string, unknown>>;
  milestoneCandidates: Array<Record<string, unknown>>;
  usedModel: string | null;
  fallback: boolean;
};

export type AgentOnboardingWorkspacePayload = {
  name: string | null;
  description: string | null;
  type: "side_project";
  onboarding: AgentOnboardingDraft;
  planningSeed: AgentOnboardingDraft;
  taskCandidates: Array<Record<string, unknown>>;
  milestoneCandidates: Array<Record<string, unknown>>;
};

type AgentOnboardingFlowProps = {
  initialDraft?: Partial<AgentOnboardingDraft>;
  initialMessages?: AgentOnboardingMessage[];
  onConfirm?: (payload: AgentOnboardingWorkspacePayload) => void | Promise<void>;
  onComplete?: (payload: AgentOnboardingWorkspacePayload) => void | Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
  clientMode?: "api" | "mock";
  className?: string;
};

const onboardingFields =
  agentOnboardingRequiredFields as AgentOnboardingFieldKey[];

function createInitialResult(initialDraft?: Partial<AgentOnboardingDraft>) {
  return buildFallbackOnboardingTurn({
    messages: [],
    draft: initialDraft ?? {},
  }) as AgentOnboardingTurnResult;
}

function withMessageIds(messages: AgentOnboardingMessage[]) {
  return messages.map((message) => ({
    ...message,
    id: message.id ?? makeId(),
  }));
}

function stripMessageForApi(message: AgentOnboardingMessage) {
  return {
    role: message.role,
    body: message.body,
    ...(message.fieldKey ? { fieldKey: message.fieldKey } : {}),
  };
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `agent-onboarding-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildPayloadFromTurn(
  turn: AgentOnboardingTurnResult,
): AgentOnboardingWorkspacePayload {
  return buildWorkspaceCreationPayload(turn) as AgentOnboardingWorkspacePayload;
}

export function AgentOnboardingFlow({
  initialDraft,
  initialMessages,
  onConfirm,
  onComplete,
  onCancel,
  disabled = false,
  clientMode,
  className,
}: AgentOnboardingFlowProps) {
  const [draft, setDraft] = useState<AgentOnboardingDraft>(() =>
    normalizeOnboardingDraft(initialDraft ?? {}),
  );
  const [result, setResult] = useState<AgentOnboardingTurnResult>(() =>
    createInitialResult(initialDraft),
  );
  const [messages, setMessages] = useState<AgentOnboardingMessage[]>(() => {
    if (initialMessages && initialMessages.length > 0) {
      return withMessageIds(initialMessages);
    }
    const initialResult = createInitialResult(initialDraft);
    return [
      {
        id: makeId(),
        role: "assistant",
        body: initialResult.reply,
        fieldKey: initialResult.fieldInFocus,
      },
    ];
  });
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "completing" | "completed"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedPayload, setCompletedPayload] =
    useState<AgentOnboardingWorkspacePayload | null>(null);

  const client = useMemo(
    () => createAgentOnboardingClient({ mode: clientMode }),
    [clientMode],
  );
  const missingFields = missingOnboardingFields(draft) as AgentOnboardingFieldKey[];
  const progressCount = onboardingFields.length - missingFields.length;
  const currentField = result.fieldInFocus ?? missingFields[0] ?? null;
  const isComplete = Boolean(completedPayload);
  const statusLabel = isComplete
    ? "답변 완료"
    : status === "submitting"
      ? "정리 중"
      : "대화 진행 중";

  async function completeTurn(turn: AgentOnboardingTurnResult) {
    const payload = buildPayloadFromTurn(turn);
    setCompletedPayload(payload);

    if (!onComplete) {
      setStatus("completed");
      return;
    }

    setStatus("completing");
    try {
      await onComplete(payload);
      setStatus("completed");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "다음 단계로 이동하는 중 오류가 발생했습니다.",
      );
      setStatus("completed");
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = input.trim();
    if (!body || disabled || status === "submitting" || status === "completing") {
      return;
    }

    const userMessage: AgentOnboardingMessage = {
      id: makeId(),
      role: "user",
      body,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const turn = (await client.runTurn({
        messages: nextMessages.map(stripMessageForApi),
        draft,
      })) as AgentOnboardingTurnResult;
      const normalizedDraft = normalizeOnboardingDraft(turn.draft);
      const assistantMessage: AgentOnboardingMessage = {
        id: makeId(),
        role: "assistant",
        body: turn.reply,
        fieldKey: turn.fieldInFocus,
      };

      setDraft(normalizedDraft);
      setResult(turn);
      setMessages([...nextMessages, assistantMessage]);

      if (turn.ready) {
        await completeTurn({
          ...turn,
          draft: normalizedDraft,
        });
        return;
      }

      setStatus("idle");
    } catch {
      const fallbackTurn = buildFallbackOnboardingTurn({
        messages: nextMessages.map(stripMessageForApi),
        draft,
      }) as AgentOnboardingTurnResult;
      const normalizedDraft = normalizeOnboardingDraft(fallbackTurn.draft);
      const assistantMessage: AgentOnboardingMessage = {
        id: makeId(),
        role: "assistant",
        body: fallbackTurn.reply,
        fieldKey: fallbackTurn.fieldInFocus,
      };

      setDraft(normalizedDraft);
      setResult(fallbackTurn);
      setMessages([...nextMessages, assistantMessage]);
      setErrorMessage("서버 응답을 받지 못해 로컬 fallback으로 이어갑니다.");

      if (fallbackTurn.ready) {
        await completeTurn({
          ...fallbackTurn,
          draft: normalizedDraft,
        });
        return;
      }

      setStatus("idle");
    }
  }

  async function continueFromCompletedState() {
    if (!completedPayload || disabled || status === "completing") return;

    const callback = onComplete ?? onConfirm;
    if (!callback) return;

    setStatus("completing");
    setErrorMessage(null);
    try {
      await callback(completedPayload);
      setStatus("completed");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "다음 단계로 이동하는 중 오류가 발생했습니다.",
      );
      setStatus("completed");
    }
  }

  return (
    <section
      className={
        className
          ? `${styles.onboardingShell} ${styles.onboardingChatShell} ${className}`
          : `${styles.onboardingShell} ${styles.onboardingChatShell}`
      }
    >
      <div className={styles.onboardingChatHeader}>
        <div>
          <p className={styles.eyebrow}>AI 온보딩</p>
          <h1>새 워크스페이스 준비</h1>
          <p>질문에 하나씩 답하면 프로젝트 시작에 필요한 맥락을 정리합니다.</p>
        </div>
        <div className={styles.statusStrip} aria-label="온보딩 진행 상태">
          <span className={styles.chip}>
            {progressCount}/{onboardingFields.length} 완료
          </span>
          <span className={styles.chip}>{statusLabel}</span>
        </div>
      </div>

      <section className={styles.onboardingChatPanel} aria-label="AI 온보딩 대화">
        <div className={styles.onboardingChatMeta}>
          <span>
            현재 질문:{" "}
            {currentField ? agentOnboardingFieldLabels[currentField] : "완료"}
          </span>
        </div>

        <div className={styles.messages}>
          {messages.map((message) => (
            <article
              className={
                message.role === "user"
                  ? `${styles.message} ${styles.messageUser}`
                  : `${styles.message} ${styles.messageAssistant}`
              }
              key={message.id}
            >
              <small>{message.role === "user" ? "나" : "AI 에이전트"}</small>
              <p>{message.body}</p>
            </article>
          ))}
        </div>

        {completedPayload ? (
          <div className={styles.completionBanner}>
            <strong>필수 답변이 모두 채워졌습니다.</strong>
            <p>다음 단계에서 요약을 확인하고 필요한 내용을 수정할 수 있습니다.</p>
            {onComplete || onConfirm ? (
              <button
                className={styles.button}
                disabled={disabled || status === "completing"}
                onClick={continueFromCompletedState}
                type="button"
              >
                {status === "completing" ? "이동 중" : "요약 확인으로 이동"}
              </button>
            ) : null}
          </div>
        ) : (
          <form className={styles.composer} onSubmit={submitMessage}>
            <label className={styles.field}>
              <span>답변</span>
              <textarea
                disabled={disabled || status === "submitting"}
                onChange={(event) => setInput(event.target.value)}
                placeholder="자연스럽게 답변해 주세요."
                value={input}
              />
            </label>
            <div className={styles.buttonRow}>
              <button
                className={styles.button}
                disabled={disabled || status === "submitting" || !input.trim()}
                type="submit"
              >
                {status === "submitting" ? "정리 중" : "보내기"}
              </button>
              {onCancel ? (
                <button
                  className={styles.secondaryButton}
                  disabled={disabled || status === "submitting"}
                  onClick={onCancel}
                  type="button"
                >
                  취소
                </button>
              ) : null}
            </div>
          </form>
        )}

        {errorMessage ? <p className={styles.errorText}>{errorMessage}</p> : null}
      </section>
    </section>
  );
}
