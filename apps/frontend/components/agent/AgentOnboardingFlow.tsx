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

const fieldInputKinds: Partial<Record<AgentOnboardingFieldKey, "textarea" | "number">> = {
  goal: "textarea",
  problem: "textarea",
  targetUser: "textarea",
  outputGoal: "textarea",
  teamSize: "number",
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
  const [status, setStatus] = useState<"idle" | "submitting" | "confirming" | "confirmed">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedPayload, setConfirmedPayload] =
    useState<AgentOnboardingWorkspacePayload | null>(null);

  const client = useMemo(
    () => createAgentOnboardingClient({ mode: clientMode }),
    [clientMode],
  );
  const missingFields = missingOnboardingFields(draft) as AgentOnboardingFieldKey[];
  const ready = missingFields.length === 0;
  const progressCount = onboardingFields.length - missingFields.length;
  const completionResult = useMemo(() => {
    if (result.ready && missingOnboardingFields(result.draft).length === 0) {
      return result;
    }

    return (ready
      ? buildFallbackOnboardingTurn({ messages: [], draft })
      : result) as AgentOnboardingTurnResult;
  }, [draft, ready, result]);
  const payloadPreview = ready
    ? (buildWorkspaceCreationPayload(completionResult) as AgentOnboardingWorkspacePayload)
    : null;

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = input.trim();
    if (!body || disabled || status === "submitting") return;

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
      setDraft(normalizedDraft);
      setResult(turn);
      setMessages([
        ...nextMessages,
        {
          id: makeId(),
          role: "assistant",
          body: turn.reply,
          fieldKey: turn.fieldInFocus,
        },
      ]);
      setStatus("idle");
    } catch {
      const fallbackTurn = buildFallbackOnboardingTurn({
        messages: nextMessages.map(stripMessageForApi),
        draft,
      }) as AgentOnboardingTurnResult;
      setDraft(normalizeOnboardingDraft(fallbackTurn.draft));
      setResult(fallbackTurn);
      setMessages([
        ...nextMessages,
        {
          id: makeId(),
          role: "assistant",
          body: fallbackTurn.reply,
          fieldKey: fallbackTurn.fieldInFocus,
        },
      ]);
      setErrorMessage("서버 응답을 받지 못해 로컬 fallback으로 이어갑니다.");
      setStatus("idle");
    }
  }

  function updateDraft(field: AgentOnboardingFieldKey, value: string) {
    const nextDraft = normalizeOnboardingDraft({
      ...draft,
      [field]: field === "teamSize" ? Number(value) : value,
    });
    const nextResult = buildFallbackOnboardingTurn({
      messages: [],
      draft: nextDraft,
    }) as AgentOnboardingTurnResult;
    setDraft(nextDraft);
    setResult(nextResult);
    setConfirmedPayload(null);
  }

  async function confirmPayload() {
    if (!ready || disabled || status === "confirming") return;

    const finalResult = buildFallbackOnboardingTurn({
      messages: [],
      draft,
    }) as AgentOnboardingTurnResult;
    const payload = buildWorkspaceCreationPayload(
      finalResult,
    ) as AgentOnboardingWorkspacePayload;

    setStatus("confirming");
    setErrorMessage(null);
    try {
      if (onConfirm) {
        await onConfirm(payload);
      } else if (onComplete) {
        await onComplete(payload);
      }
      setConfirmedPayload(payload);
      setStatus("confirmed");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "확정 처리 중 오류가 발생했습니다.",
      );
      setStatus("idle");
    }
  }

  return (
    <section className={className ? `${styles.onboardingShell} ${className}` : styles.onboardingShell}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>AI 온보딩</p>
          <h1>새 워크스페이스 준비</h1>
          <p>
            답변을 모아 초기 기획 맥락, MVP 방향, Task 후보를 함께 만듭니다.
          </p>
        </div>
        <div className={styles.statusStrip} aria-label="온보딩 진행률">
          <span className={styles.chip}>
            {progressCount}/{onboardingFields.length} 완료
          </span>
          <span className={styles.chip}>
            {ready ? "요약 확인 가능" : "대화 진행 중"}
          </span>
        </div>
      </div>

      <div className={styles.progressGrid}>
        {onboardingFields.map((field) => {
          const isDone = !missingFields.includes(field);
          return (
            <span
              className={
                isDone
                  ? `${styles.progressItem} ${styles.progressItemDone}`
                  : styles.progressItem
              }
              key={field}
            >
              {agentOnboardingFieldLabels[field]}
            </span>
          );
        })}
      </div>

      <div className={styles.onboardingLayout}>
        <section className={styles.panel} aria-label="AI 에이전트 대화">
          <h2>대화</h2>
          <div className={styles.messages}>
            {messages.map((message) => (
              <article
                className={
                  message.role === "user"
                    ? `${styles.message} ${styles.messageUser}`
                    : styles.message
                }
                key={message.id}
              >
                <small>{message.role === "user" ? "나" : "AI 에이전트"}</small>
                <p>{message.body}</p>
              </article>
            ))}
          </div>
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
          {errorMessage ? <p className={styles.errorText}>{errorMessage}</p> : null}
        </section>

        <aside className={styles.panel} aria-label="온보딩 요약">
          <h2>요약과 수정</h2>
          <div className={styles.summaryGrid}>
            {onboardingFields.map((field) => {
              const inputKind = fieldInputKinds[field];
              const value = draft[field] ?? "";
              return (
                <label className={styles.field} key={field}>
                  <span>{agentOnboardingFieldLabels[field]}</span>
                  {inputKind === "textarea" ? (
                    <textarea
                      disabled={disabled}
                      onChange={(event) => updateDraft(field, event.target.value)}
                      value={String(value)}
                    />
                  ) : (
                    <input
                      disabled={disabled}
                      min={field === "teamSize" ? 1 : undefined}
                      onChange={(event) => updateDraft(field, event.target.value)}
                      type={inputKind ?? "text"}
                      value={String(value)}
                    />
                  )}
                </label>
              );
            })}
          </div>
          <div className={styles.buttonRow}>
            <button
              className={styles.button}
              disabled={!ready || disabled || status === "confirming"}
              onClick={confirmPayload}
              type="button"
            >
              {status === "confirming" ? "확정 중" : "이 내용으로 확정"}
            </button>
          </div>
          {!ready ? (
            <p className={styles.muted}>
              아직 비어 있는 항목이 있습니다. 대화로 채우거나 직접 수정해 주세요.
            </p>
          ) : null}
          {confirmedPayload ? (
            <p className={styles.successText}>워크스페이스 생성 payload가 준비됐습니다.</p>
          ) : null}
        </aside>
      </div>

      {payloadPreview ? (
        <section className={styles.split} aria-label="초기 후보">
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <h3>초기 Task 후보</h3>
              <span className={styles.tag}>planning_feature</span>
            </div>
            <ul className={styles.list}>
              {payloadPreview.taskCandidates.map((task, index) => (
                <li className={styles.listItem} key={String(task.sourceId ?? index)}>
                  <strong>{String(task.title ?? "")}</strong>
                  <p>{String(task.description ?? "")}</p>
                </li>
              ))}
            </ul>
          </article>
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <h3>초기 마일스톤 후보</h3>
              <span className={styles.tag}>후보</span>
            </div>
            <ul className={styles.list}>
              {payloadPreview.milestoneCandidates.map((milestone, index) => (
                <li className={styles.listItem} key={`${milestone.title}-${index}`}>
                  <strong>{String(milestone.title ?? "")}</strong>
                  <p>상태: {String(milestone.status ?? "planned")}</p>
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}
    </section>
  );
}
