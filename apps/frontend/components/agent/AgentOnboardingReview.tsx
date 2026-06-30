"use client";

import { useMemo, useState } from "react";
import {
  agentOnboardingFieldLabels,
  agentOnboardingRequiredFields,
  buildFallbackOnboardingTurn,
  buildWorkspaceCreationPayload,
  normalizeOnboardingDraft,
} from "../../lib/agent/agentOnboardingClient.mjs";
import {
  type AgentOnboardingWorkspacePayload,
} from "./AgentOnboardingFlow";
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

type AgentOnboardingDraft = AgentOnboardingWorkspacePayload["onboarding"];

type AgentOnboardingReviewProps = {
  payload: AgentOnboardingWorkspacePayload;
  onChange?: (payload: AgentOnboardingWorkspacePayload) => void;
  onConfirm?: (payload: AgentOnboardingWorkspacePayload) => void | Promise<void>;
  onBack?: () => void;
  disabled?: boolean;
  className?: string;
};

const onboardingFields =
  agentOnboardingRequiredFields as AgentOnboardingFieldKey[];

const fieldInputKinds: Partial<Record<AgentOnboardingFieldKey, "textarea" | "number">> = {
  goal: "textarea",
  problem: "textarea",
  targetUser: "textarea",
  outputGoal: "textarea",
  teamSize: "number",
};

function rebuildPayload(draft: AgentOnboardingDraft) {
  const turn = buildFallbackOnboardingTurn({
    messages: [],
    draft,
  });

  return buildWorkspaceCreationPayload(turn) as AgentOnboardingWorkspacePayload;
}

export function AgentOnboardingReview({
  payload,
  onChange,
  onConfirm,
  onBack,
  disabled = false,
  className,
}: AgentOnboardingReviewProps) {
  const [draft, setDraft] = useState<AgentOnboardingDraft>(() =>
    normalizeOnboardingDraft(payload.onboarding ?? payload.planningSeed ?? {}),
  );
  const [submitting, setSubmitting] = useState(false);
  const currentPayload = useMemo(() => rebuildPayload(draft), [draft]);

  function updateDraft(field: AgentOnboardingFieldKey, value: string) {
    const nextDraft = normalizeOnboardingDraft({
      ...draft,
      [field]: field === "teamSize" ? Number(value) : value,
    });
    const nextPayload = rebuildPayload(nextDraft);
    setDraft(nextDraft);
    onChange?.(nextPayload);
  }

  async function confirmReview() {
    if (!onConfirm || disabled || submitting) return;

    setSubmitting(true);
    try {
      await onConfirm(currentPayload);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className={
        className
          ? `${styles.onboardingShell} ${styles.onboardingReviewShell} ${className}`
          : `${styles.onboardingShell} ${styles.onboardingReviewShell}`
      }
    >
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>온보딩 확인</p>
          <h1>입력한 내용을 확인해 주세요</h1>
          <p>워크스페이스를 만들기 전에 프로젝트 맥락과 초기 후보를 정리합니다.</p>
        </div>
      </div>

      <div className={styles.onboardingReviewLayout}>
        <section className={styles.panel} aria-label="온보딩 요약 수정">
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
            {onBack ? (
              <button
                className={styles.secondaryButton}
                disabled={disabled || submitting}
                onClick={onBack}
                type="button"
              >
                이전으로
              </button>
            ) : null}
            {onConfirm ? (
              <button
                className={styles.button}
                disabled={disabled || submitting}
                onClick={confirmReview}
                type="button"
              >
                {submitting ? "확정 중" : "워크스페이스 만들기"}
              </button>
            ) : null}
          </div>
        </section>

        <section className={styles.stack} aria-label="초기 후보 미리보기">
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <h3>초기 Task 후보</h3>
              <span className={styles.tag}>planning_feature</span>
            </div>
            <ul className={styles.list}>
              {currentPayload.taskCandidates.map((task, index) => (
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
              {currentPayload.milestoneCandidates.map((milestone, index) => (
                <li className={styles.listItem} key={`${milestone.title}-${index}`}>
                  <strong>{String(milestone.title ?? "")}</strong>
                  <p>상태: {String(milestone.status ?? "planned")}</p>
                </li>
              ))}
            </ul>
          </article>
        </section>
      </div>
    </section>
  );
}
