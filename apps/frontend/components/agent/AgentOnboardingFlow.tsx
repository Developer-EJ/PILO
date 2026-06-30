"use client";

import { type FormEvent, useState } from "react";
import {
  agentOnboardingFieldLabels,
  agentOnboardingRequiredFields,
  buildFallbackOnboardingTurn,
  buildWorkspaceCreationPayload,
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

const fieldInputKinds: Partial<
  Record<AgentOnboardingFieldKey, "textarea" | "number">
> = {
  goal: "textarea",
  problem: "textarea",
  targetUser: "textarea",
  outputGoal: "textarea",
  teamSize: "number",
};

const wizardQuestions: Record<AgentOnboardingFieldKey, string> = {
  workspaceTitle: "새 워크스페이스 이름을 무엇으로 할까요?",
  goal: "이 워크스페이스로 이루고 싶은 가장 중요한 목표는 무엇인가요?",
  problem: "지금 해결하려는 문제나 불편함은 무엇인가요?",
  targetUser: "가장 먼저 도와야 할 대상 사용자는 누구인가요?",
  duration: "MVP를 어느 정도 기간 안에 만들 계획인가요?",
  teamSize: "함께 만드는 팀은 몇 명인가요?",
  experienceLevel: "팀의 경험 수준은 어디에 가까운가요?",
  outputGoal: "마지막으로, 최종 산출물은 무엇이면 좋을까요?",
};

const wizardPlaceholders: Record<AgentOnboardingFieldKey, string> = {
  workspaceTitle: "예: 정글 중고거래 앱",
  goal: "예: 정글 내부에서 안전하게 중고 물품을 거래할 수 있게 만들기",
  problem: "예: 거래 글이 흩어져 있고 신뢰할 수 있는 거래 흐름이 부족함",
  targetUser: "예: 정글 교육생과 운영진",
  duration: "예: 한 달",
  teamSize: "예: 5",
  experienceLevel: "예: 초보",
  outputGoal: "예: 배포 가능한 MVP",
};

function buildPayloadFromDraft(
  draft: AgentOnboardingDraft,
): AgentOnboardingWorkspacePayload {
  const turn = buildFallbackOnboardingTurn({
    messages: [],
    draft,
  }) as AgentOnboardingTurnResult;

  return buildWorkspaceCreationPayload({
    ...turn,
    draft,
    ready: true,
    missingFields: [],
  }) as AgentOnboardingWorkspacePayload;
}

function coerceFieldValue(field: AgentOnboardingFieldKey, value: string) {
  if (field !== "teamSize") return value;
  return value.trim() ? Number(value) : null;
}

function inputValue(value: string | number | null) {
  return value === null ? "" : String(value);
}

export function AgentOnboardingFlow({
  initialDraft,
  onConfirm,
  onComplete,
  disabled = false,
  className,
}: AgentOnboardingFlowProps) {
  const [draft, setDraft] = useState<AgentOnboardingDraft>(() =>
    normalizeOnboardingDraft(initialDraft ?? {}),
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState<"idle" | "completing" | "completed">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const normalizedDraft = normalizeOnboardingDraft(draft);
  const missingFields = missingOnboardingFields(
    normalizedDraft,
  ) as AgentOnboardingFieldKey[];
  const progressCount = onboardingFields.length - missingFields.length;
  const currentField = onboardingFields[currentStep];
  const currentValue = normalizedDraft[currentField];
  const inputKind = fieldInputKinds[currentField];
  const isLastStep = currentStep === onboardingFields.length - 1;
  const isCurrentAnswerValid = !missingFields.includes(currentField);
  const progressPercent = Math.round(
    (progressCount / onboardingFields.length) * 100,
  );

  function updateDraft(field: AgentOnboardingFieldKey, value: string) {
    setDraft(
      normalizeOnboardingDraft({
        ...normalizedDraft,
        [field]: coerceFieldValue(field, value),
      }),
    );
    setErrorMessage(null);
  }

  function goPrevious() {
    setCurrentStep((step) => Math.max(0, step - 1));
    setErrorMessage(null);
  }

  function goNext() {
    if (!isCurrentAnswerValid) return;
    setCurrentStep((step) => Math.min(onboardingFields.length - 1, step + 1));
    setErrorMessage(null);
  }

  async function confirmWizard() {
    if (!isCurrentAnswerValid || disabled || status === "completing") return;

    const remainingFields = missingOnboardingFields(
      normalizedDraft,
    ) as AgentOnboardingFieldKey[];
    if (remainingFields.length > 0) {
      setCurrentStep(onboardingFields.indexOf(remainingFields[0]));
      return;
    }

    const callback = onComplete ?? onConfirm;
    const payload = buildPayloadFromDraft(normalizedDraft);

    if (!callback) {
      setStatus("completed");
      return;
    }

    setStatus("completing");
    setErrorMessage(null);
    try {
      await callback(payload);
      setStatus("completed");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "다음 단계로 이동하는 중 오류가 발생했습니다.",
      );
      setStatus("idle");
    }
  }

  async function submitStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLastStep) {
      await confirmWizard();
      return;
    }
    goNext();
  }

  return (
    <section
      className={
        className
          ? `${styles.onboardingShell} ${styles.onboardingWizardShell} ${className}`
          : `${styles.onboardingShell} ${styles.onboardingWizardShell}`
      }
    >
      <form className={styles.onboardingWizardModal} onSubmit={submitStep}>
        <header className={styles.onboardingWizardHeader}>
          <div>
            <p className={styles.eyebrow}>온보딩</p>
            <h1>새 워크스페이스 준비</h1>
            <p>프로젝트 시작에 필요한 정보를 단계별로 정리합니다.</p>
          </div>
          <div className={styles.statusStrip} aria-label="온보딩 진행 상태">
            <span className={styles.chip}>
              {currentStep + 1}/{onboardingFields.length} 질문
            </span>
            <span className={styles.chip}>{progressCount}개 답변 완료</span>
          </div>
        </header>

        <div className={styles.onboardingWizardProgress} aria-hidden="true">
          <span style={{ width: `${progressPercent}%` }} />
        </div>

        <div className={styles.onboardingWizardBody}>
          <aside className={styles.onboardingQuestionPane}>
            <span className={styles.wizardStepBadge}>질문 {currentStep + 1}</span>
            <h2>{wizardQuestions[currentField]}</h2>
            <p>{agentOnboardingFieldLabels[currentField]}</p>
            <ol className={styles.wizardStepList}>
              {onboardingFields.map((field, index) => {
                const answered = !missingFields.includes(field);
                const active = index === currentStep;

                return (
                  <li
                    className={[
                      styles.wizardStepItem,
                      active ? styles.wizardStepItemActive : "",
                      answered ? styles.wizardStepItemDone : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={field}
                  >
                    <span>{index + 1}</span>
                    <strong>{agentOnboardingFieldLabels[field]}</strong>
                  </li>
                );
              })}
            </ol>
          </aside>

          <section className={styles.onboardingAnswerPane}>
            <label className={styles.field}>
              <span>{agentOnboardingFieldLabels[currentField]}</span>
              {inputKind === "textarea" ? (
                <textarea
                  autoFocus
                  disabled={disabled || status === "completing"}
                  onChange={(event) =>
                    updateDraft(currentField, event.target.value)
                  }
                  placeholder={wizardPlaceholders[currentField]}
                  value={inputValue(currentValue)}
                />
              ) : (
                <input
                  autoFocus
                  disabled={disabled || status === "completing"}
                  min={inputKind === "number" ? 1 : undefined}
                  onChange={(event) =>
                    updateDraft(currentField, event.target.value)
                  }
                  placeholder={wizardPlaceholders[currentField]}
                  type={inputKind ?? "text"}
                  value={inputValue(currentValue)}
                />
              )}
            </label>
            <p className={styles.onboardingWizardHint}>
              답변을 입력하면 다음 단계로 이동할 수 있습니다.
            </p>
          </section>
        </div>

        <footer className={styles.onboardingWizardFooter}>
          <button
            className={styles.secondaryButton}
            disabled={disabled || status === "completing" || currentStep === 0}
            onClick={goPrevious}
            type="button"
          >
            이전
          </button>
          <button
            className={styles.button}
            disabled={
              disabled || status === "completing" || !isCurrentAnswerValid
            }
            type="submit"
          >
            {isLastStep
              ? status === "completing"
                ? "확인 중"
                : "확인"
              : "다음"}
          </button>
        </footer>
      </form>

      {errorMessage ? <p className={styles.errorText}>{errorMessage}</p> : null}
    </section>
  );
}
