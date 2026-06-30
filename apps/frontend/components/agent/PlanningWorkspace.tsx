"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createAgentClient } from "../../lib/agent/agentClient.mjs";
import {
  buildPlanningFormValuesFromSeed,
  readPlanningOnboardingSeed,
} from "../../lib/agent/onboardingPlanningSeed.mjs";
import { AgentWorkspaceNav } from "./AgentWorkspaceNav";
import styles from "./agent-workspace.module.css";

type PlanFeature = {
  id: string;
  title: string;
  description: string;
  scope: string;
  reason: string;
};

type PlanDetail = {
  id: string;
  workspaceId: string;
  goal: string;
  targetUser: string;
  problem: string;
  duration: string;
  outputGoal: string;
  status: string;
  techStack: {
    frontend: string;
    backend: string;
    databaseName: string;
    ai: string;
    deploy: string;
    reason: string;
    difficulty: string;
    alternatives: string[];
  } | null;
  featureDrafts: PlanFeature[];
  roleDrafts: Array<{
    id: string;
    member: { name: string };
    suggestedRole: string;
    reason: string;
  }>;
  milestoneDrafts: Array<{
    id: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
  }>;
  riskNotes: Array<{
    id: string;
    content: string;
    severity: string;
  }>;
  firstAgendaDraft: {
    title: string;
    objective: string;
    agendaItems: string[];
    durationMinutes: number;
  } | null;
  approval: {
    status: string;
    actionId: string | null;
    ownerApiResults: Array<{
      operation: string;
      sourceDraftId: string;
      status: string;
      targetEntityId: string | null;
      errorMessage: string | null;
    }>;
  };
};

type Recommendation = {
  id: string;
  title: string;
  summary: string;
  status: string;
  source: string;
};

type PlanningSeed = {
  workspaceTitle: string | null;
  goal: string | null;
  problem: string | null;
  targetUser: string | null;
  duration: string | null;
  teamSize: number | null;
  experienceLevel: string | null;
  outputGoal: string | null;
};

type PlanningFormValues = {
  workspaceTitle: string;
  goal: string;
  problem: string;
  targetUser: string;
  duration: string;
  teamSize: number;
  experienceLevel: string;
  outputGoal: string;
};

type PlanningWorkspaceProps = {
  initialWorkspaceId?: string;
  workspaceScopedLinks?: boolean;
};

const defaultWorkspaceId = "22222222-2222-4222-8222-222222222222";

const defaultFormValues: PlanningFormValues = {
  workspaceTitle: "PILO MVP",
  goal: "초보 개발팀을 위한 AI 프로젝트 운영 MVP",
  problem:
    "팀의 역할 분배, Task 분해, 회의 후속 작업이 흩어져 있어 프로젝트 시작이 느립니다.",
  targetUser: "부트캠프 프로젝트 팀",
  duration: "4 weeks",
  teamSize: 5,
  experienceLevel: "beginner",
  outputGoal: "시연 가능한 MVP와 발표 자료",
};

const statusLabels: Record<string, string> = {
  idle: "대기 중",
  creating: "초안 생성 중",
  ready: "준비됨",
  error: "오류",
  approving: "승인 중",
  rejecting: "거절 중",
  draft: "초안",
  reviewing: "검토 중",
  approved: "승인됨",
  rejected: "거절됨",
  waiting_confirmation: "승인 대기",
  confirmed: "승인됨",
  executed: "실행됨",
  pending: "대기 중",
  succeeded: "생성됨",
  skipped: "건너뜀",
  failed: "실패",
};

const scopeLabels: Record<string, string> = {
  mvp: "MVP",
  should: "권장",
  could: "선택",
  excluded: "제외",
};

const severityLabels: Record<string, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
  critical: "치명적",
};

const difficultyLabels: Record<string, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

const operationLabels: Record<string, string> = {
  "task.create": "Task 생성",
  "milestone.create": "마일스톤 생성",
};

const experienceLabels: Record<string, string> = {
  beginner: "초보",
  mixed: "혼합",
  experienced: "경험 있음",
};

function labelFor(value: string, labels: Record<string, string>) {
  return labels[value] ?? value;
}

export function PlanningWorkspace({
  initialWorkspaceId = defaultWorkspaceId,
  workspaceScopedLinks = false,
}: PlanningWorkspaceProps = {}) {
  const client = useMemo(() => createAgentClient(), []);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [formValues, setFormValues] =
    useState<PlanningFormValues>(defaultFormValues);
  const [teamMembers, setTeamMembers] = useState("세인, 프론트, 백엔드");
  const [onboardingSeed, setOnboardingSeed] = useState<PlanningSeed | null>(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  useEffect(() => {
    const seed = readPlanningOnboardingSeed({
      workspaceId,
      search: undefined,
      storage: undefined,
    }) as PlanningSeed | null;
    setOnboardingSeed(seed);
    if (!seed) return;

    setFormValues(
      buildPlanningFormValuesFromSeed(
        defaultFormValues,
        seed,
      ) as PlanningFormValues,
    );
  }, [workspaceId]);

  async function refreshRecommendations(nextWorkspaceId = workspaceId) {
    const nextRecommendations =
      await client.listRecommendations(nextWorkspaceId);
    setRecommendations(nextRecommendations as Recommendation[]);
  }

  function updateFormValue<K extends keyof PlanningFormValues>(
    key: K,
    value: PlanningFormValues[K],
  ) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("creating");
    setError(null);

    try {
      const created = (await client.createProjectPlanDraft(workspaceId, {
        workspaceTitle: formValues.workspaceTitle,
        goal: formValues.goal,
        targetUser: formValues.targetUser,
        problem: formValues.problem,
        duration: formValues.duration,
        outputGoal: formValues.outputGoal,
        teamSize: formValues.teamSize,
        experienceLevel: formValues.experienceLevel,
        teamMembers: teamMembers
          .split(",")
          .map((member) => member.trim())
          .filter(Boolean),
      })) as PlanDetail;
      setPlan(created);
      await refreshRecommendations(created.workspaceId);
      setStatus("ready");
    } catch {
      setError("계획 초안을 만들지 못했습니다. 서버 연결과 권한을 확인해 주세요.");
      setStatus("error");
    }
  }

  async function approvePlan() {
    if (!plan) return;
    setStatus("approving");
    const approved = (await client.approveProjectPlanDraft(plan.id)) as PlanDetail;
    setPlan(approved);
    await refreshRecommendations(approved.workspaceId);
    setStatus("ready");
  }

  async function transitionAction(
    actionId: string,
    transition: "approve" | "reject",
  ) {
    setStatus(transition === "approve" ? "approving" : "rejecting");
    if (transition === "approve") {
      await client.approveAction(actionId);
    } else {
      await client.rejectAction(actionId);
    }
    await refreshRecommendations();
    setStatus("ready");
  }

  return (
    <main className={styles.screen}>
      <div className={styles.shell}>
        <AgentWorkspaceNav
          active="planning"
          workspaceId={workspaceScopedLinks ? workspaceId : undefined}
        />

        <section className={styles.main}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>프로젝트 시작 AI 에이전트</p>
              <h1>계획 초안</h1>
              <p>
                온보딩에서 입력한 워크스페이스 맥락을 바탕으로 Task 후보와 계획
                초안을 검토합니다.
              </p>
            </div>
            <div className={styles.statusStrip}>
              <span className={styles.chip}>모드: AI 에이전트 / 계획</span>
              <span className={styles.chip}>
                상태: {labelFor(status, statusLabels)}
              </span>
            </div>
          </header>

          {onboardingSeed ? (
            <section className={styles.seedPanel} aria-label="온보딩 맥락">
              <div>
                <p className={styles.eyebrow}>온보딩 맥락 적용됨</p>
                <h2>{onboardingSeed.workspaceTitle ?? formValues.workspaceTitle}</h2>
                <p>{onboardingSeed.goal ?? formValues.goal}</p>
              </div>
              <div className={styles.metaLine}>
                <span className={styles.tag}>
                  {onboardingSeed.targetUser ?? formValues.targetUser}
                </span>
                <span className={styles.tag}>
                  {onboardingSeed.duration ?? formValues.duration}
                </span>
                <span className={styles.tag}>
                  팀 {onboardingSeed.teamSize ?? formValues.teamSize}명
                </span>
              </div>
            </section>
          ) : null}

          <div className={styles.grid}>
            <section className={styles.panel}>
              <h2>계획 시작</h2>
              <form className={styles.form} onSubmit={handleSubmit}>
                <label className={styles.field}>
                  <span>워크스페이스 ID</span>
                  <input
                    onChange={(event) => setWorkspaceId(event.target.value)}
                    required
                    value={workspaceId}
                  />
                </label>
                <label className={styles.field}>
                  <span>워크스페이스 제목</span>
                  <input
                    name="workspaceTitle"
                    onChange={(event) =>
                      updateFormValue("workspaceTitle", event.target.value)
                    }
                    required
                    value={formValues.workspaceTitle}
                  />
                </label>
                <label className={styles.field}>
                  <span>목표</span>
                  <input
                    name="goal"
                    onChange={(event) =>
                      updateFormValue("goal", event.target.value)
                    }
                    required
                    value={formValues.goal}
                  />
                </label>
                <label className={styles.field}>
                  <span>해결할 문제</span>
                  <textarea
                    name="problem"
                    onChange={(event) =>
                      updateFormValue("problem", event.target.value)
                    }
                    required
                    value={formValues.problem}
                  />
                </label>
                <div className={styles.row}>
                  <label className={styles.field}>
                    <span>대상 사용자</span>
                    <input
                      name="targetUser"
                      onChange={(event) =>
                        updateFormValue("targetUser", event.target.value)
                      }
                      required
                      value={formValues.targetUser}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>기간</span>
                    <input
                      name="duration"
                      onChange={(event) =>
                        updateFormValue("duration", event.target.value)
                      }
                      required
                      value={formValues.duration}
                    />
                  </label>
                </div>
                <div className={styles.row}>
                  <label className={styles.field}>
                    <span>팀 규모</span>
                    <input
                      min={1}
                      name="teamSize"
                      onChange={(event) =>
                        updateFormValue("teamSize", Number(event.target.value))
                      }
                      type="number"
                      value={formValues.teamSize}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>경험 수준</span>
                    <select
                      name="experienceLevel"
                      onChange={(event) =>
                        updateFormValue("experienceLevel", event.target.value)
                      }
                      value={formValues.experienceLevel}
                    >
                      {Object.entries(experienceLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className={styles.field}>
                  <span>최종 산출물</span>
                  <input
                    name="outputGoal"
                    onChange={(event) =>
                      updateFormValue("outputGoal", event.target.value)
                    }
                    value={formValues.outputGoal}
                  />
                </label>
                <label className={styles.field}>
                  <span>팀원</span>
                  <input
                    onChange={(event) => setTeamMembers(event.target.value)}
                    value={teamMembers}
                  />
                </label>
                <button className={styles.button} disabled={status === "creating"}>
                  초안 만들기
                </button>
              </form>
              {error ? <p className={styles.empty}>{error}</p> : null}
            </section>

            <section className={styles.stack}>
              {plan ? (
                <>
                  <article className={styles.card}>
                    <div className={styles.cardHead}>
                      <div>
                        <p className={styles.eyebrow}>프로젝트 요약</p>
                        <h3>{plan.goal}</h3>
                      </div>
                      <span className={styles.tag}>
                        {labelFor(plan.status, statusLabels)}
                      </span>
                    </div>
                    <p className={styles.muted}>{plan.problem}</p>
                    <div className={styles.metaLine}>
                      <span className={styles.tag}>{plan.targetUser}</span>
                      <span className={styles.tag}>{plan.duration}</span>
                      <span className={styles.tag}>{plan.outputGoal}</span>
                    </div>
                  </article>

                  {plan.techStack ? (
                    <article className={styles.card}>
                      <div className={styles.cardHead}>
                        <h3>추천 기술 스택</h3>
                        <span className={styles.tag}>
                          난이도:{" "}
                          {labelFor(plan.techStack.difficulty, difficultyLabels)}
                        </span>
                      </div>
                      <p className={styles.muted}>{plan.techStack.reason}</p>
                      <div className={styles.metaLine}>
                        <span className={styles.tag}>{plan.techStack.frontend}</span>
                        <span className={styles.tag}>{plan.techStack.backend}</span>
                        <span className={styles.tag}>
                          {plan.techStack.databaseName}
                        </span>
                        <span className={styles.tag}>{plan.techStack.ai}</span>
                      </div>
                    </article>
                  ) : null}

                  <article className={styles.card}>
                    <div className={styles.cardHead}>
                      <h3>기능 후보</h3>
                      <span className={styles.tag}>{plan.featureDrafts.length}</span>
                    </div>
                    <ul className={styles.list}>
                      {plan.featureDrafts.map((feature) => (
                        <li className={styles.listItem} key={feature.id}>
                          <div className={styles.metaLine}>
                            <span
                              className={`${styles.tag} ${
                                feature.scope === "mvp"
                                  ? styles.tagMvp
                                  : feature.scope === "excluded"
                                    ? styles.tagExcluded
                                    : ""
                              }`}
                            >
                              {labelFor(feature.scope, scopeLabels)}
                            </span>
                          </div>
                          <strong>{feature.title}</strong>
                          <p>{feature.description}</p>
                          <p>{feature.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <div className={styles.split}>
                    <article className={styles.card}>
                      <h3>역할 제안</h3>
                      <ul className={styles.list}>
                        {plan.roleDrafts.map((role) => (
                          <li className={styles.listItem} key={role.id}>
                            <strong>{role.member.name}</strong>
                            <p>{role.suggestedRole}</p>
                          </li>
                        ))}
                      </ul>
                    </article>
                    <article className={styles.card}>
                      <h3>리스크</h3>
                      <ul className={styles.list}>
                        {plan.riskNotes.map((risk) => (
                          <li className={styles.listItem} key={risk.id}>
                            <span className={styles.tag}>
                              {labelFor(risk.severity, severityLabels)}
                            </span>
                            <p>{risk.content}</p>
                          </li>
                        ))}
                      </ul>
                    </article>
                  </div>

                  <article className={styles.card}>
                    <div className={styles.cardHead}>
                      <div>
                        <h3>계획 승인</h3>
                        <p className={styles.muted}>
                          현재 상태는{" "}
                          {labelFor(plan.approval.status, statusLabels)}입니다.
                          Task와 마일스톤 실제 생성은 담당 도메인 API 연결 뒤
                          실행됩니다.
                        </p>
                      </div>
                      <button
                        className={styles.button}
                        disabled={plan.approval.status !== "waiting_confirmation"}
                        onClick={approvePlan}
                        type="button"
                      >
                        계획 승인
                      </button>
                    </div>
                    <ul className={styles.list}>
                      {plan.approval.ownerApiResults.map((result) => (
                        <li
                          className={styles.listItem}
                          key={`${result.operation}-${result.sourceDraftId}`}
                        >
                          <strong>
                            {labelFor(result.operation, operationLabels)}
                          </strong>
                          <p>{labelFor(result.status, statusLabels)}</p>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article className={styles.card}>
                    <div className={styles.cardHead}>
                      <h3>실행 제안</h3>
                      <span className={styles.tag}>{recommendations.length}</span>
                    </div>
                    <ul className={styles.list}>
                      {recommendations.map((item) => (
                        <li className={styles.listItem} key={item.id}>
                          <strong>{item.title}</strong>
                          <p>{item.summary}</p>
                          <div className={styles.buttonRow}>
                            <span className={styles.tag}>
                              {labelFor(item.status, statusLabels)}
                            </span>
                            <button
                              className={styles.secondaryButton}
                              disabled={item.status !== "waiting_confirmation"}
                              onClick={() => transitionAction(item.id, "approve")}
                              type="button"
                            >
                              승인
                            </button>
                            <button
                              className={styles.dangerButton}
                              disabled={item.status !== "waiting_confirmation"}
                              onClick={() => transitionAction(item.id, "reject")}
                              type="button"
                            >
                              거절
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>
                </>
              ) : (
                <div className={styles.empty}>
                  계획 초안을 만들면 AI 제안을 여기에서 검토할 수 있습니다.
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
