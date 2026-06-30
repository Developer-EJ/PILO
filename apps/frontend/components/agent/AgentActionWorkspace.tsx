"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createAgentClient } from "../../lib/agent/agentClient.mjs";
import {
  buildAgentMessageFromPlanningSeed,
  readPlanningOnboardingSeed,
} from "../../lib/agent/onboardingPlanningSeed.mjs";
import { AgentWorkspaceNav } from "./AgentWorkspaceNav";
import styles from "./agent-workspace.module.css";

type Message = {
  id: string;
  role: "user" | "assistant";
  body: string;
  runId: string | null;
};

type Action = {
  id: string;
  type: string;
  source: string;
  status: string;
  payload: Record<string, unknown>;
};

type Run = {
  id: string;
  workflowType: string;
  status: string;
  output: { summary?: string } | null;
  actions: Action[];
  trace: Array<{ id: string; message: string }>;
};

type AgentActionWorkspaceProps = {
  initialWorkspaceId?: string;
  workspaceScopedLinks?: boolean;
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

const defaultWorkspaceId = "22222222-2222-4222-8222-222222222222";
const defaultAgentMessage = "이번 MVP 범위를 실행 가능한 Task 초안으로 나눠 주세요.";

const statusLabels: Record<string, string> = {
  idle: "대기 중",
  running: "실행 중",
  ready: "준비됨",
  error: "오류",
  approving: "승인 중",
  rejecting: "거절 중",
  requires_confirmation: "승인 필요",
  succeeded: "완료",
  failed: "실패",
  waiting_confirmation: "승인 대기",
  confirmed: "승인됨",
  rejected: "거절됨",
  executed: "실행됨",
};

const roleLabels: Record<Message["role"], string> = {
  user: "사용자",
  assistant: "AI 에이전트",
};

const workflowLabels: Record<string, string> = {
  "task.draft.generate": "Task 초안 만들기",
  "planning.generate": "계획 초안 만들기",
  "meeting.report.generate": "회의록 요약 만들기",
  "review.analysis.generate": "코드 리뷰 분석 만들기",
  "orchestrator.run": "워크플로 조율",
};

const sourceLabels: Record<string, string> = {
  meeting: "회의",
  task: "Task",
  github: "GitHub",
  review: "리뷰",
  planning: "계획",
  orchestrator: "오케스트레이터",
};

function labelFor(value: string, labels: Record<string, string>) {
  return labels[value] ?? value;
}

export function AgentActionWorkspace({
  initialWorkspaceId = defaultWorkspaceId,
  workspaceScopedLinks = false,
}: AgentActionWorkspaceProps = {}) {
  const client = useMemo(() => createAgentClient(), []);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageDraft, setMessageDraft] = useState(defaultAgentMessage);
  const [run, setRun] = useState<Run | null>(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const seed = readPlanningOnboardingSeed({
      workspaceId,
      search: undefined,
      storage: undefined,
    }) as PlanningSeed | null;
    setMessageDraft(buildAgentMessageFromPlanningSeed(seed));
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    client
      .listChatMessages(workspaceId)
      .then((items: Message[]) => {
        if (!cancelled) setMessages(items);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, workspaceId]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("running");
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const result = (await client.sendChatMessage(workspaceId, {
        message: messageDraft,
        workflowType: String(form.get("workflowType") ?? "task.draft.generate"),
        contextRefs: [],
      })) as { run: Run };
      setRun(result.run);
      setMessages((await client.listChatMessages(workspaceId)) as Message[]);
      setStatus("ready");
    } catch {
      setError(
        "AI 에이전트를 실행하지 못했습니다. 서버 연결과 권한을 확인해 주세요.",
      );
      setStatus("error");
    }
  }

  async function transitionAction(
    actionId: string,
    transition: "approve" | "reject",
  ) {
    if (!run) return;
    setStatus(transition === "approve" ? "approving" : "rejecting");
    const updated = (transition === "approve"
      ? await client.approveAction(actionId)
      : await client.rejectAction(actionId)) as Run;
    setRun(updated);
    setMessages((await client.listChatMessages(workspaceId)) as Message[]);
    setStatus("ready");
  }

  return (
    <main className={styles.screen}>
      <div className={styles.shell}>
        <AgentWorkspaceNav
          active="agent"
          workspaceId={workspaceScopedLinks ? workspaceId : undefined}
        />

        <section className={styles.main}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>AI 에이전트 실행 제안</p>
              <h1>실행 제안 검토</h1>
              <p>
                AI 에이전트가 만든 실행 제안을 확인하고, 담당 도메인 실행
                전에 승인하거나 거절합니다.
              </p>
            </div>
            <div className={styles.statusStrip}>
              <span className={styles.chip}>
                상태: {labelFor(status, statusLabels)}
              </span>
              <span className={styles.chip}>
                실행: {run ? labelFor(run.status, statusLabels) : "없음"}
              </span>
            </div>
          </header>

          <div className={styles.chatShell}>
            <section className={styles.panel}>
              <h2>요청 입력</h2>
              <form className={styles.form} onSubmit={handleSend}>
                <label className={styles.field}>
                  <span>워크스페이스 ID</span>
                  <input
                    onChange={(event) => setWorkspaceId(event.target.value)}
                    required
                    value={workspaceId}
                  />
                </label>
                <label className={styles.field}>
                  <span>워크플로</span>
                  <select defaultValue="task.draft.generate" name="workflowType">
                    {Object.entries(workflowLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>요청 내용</span>
                  <textarea
                    name="message"
                    onChange={(event) => setMessageDraft(event.target.value)}
                    required
                    value={messageDraft}
                  />
                </label>
                <button className={styles.button} disabled={status === "running"}>
                  AI 에이전트 실행
                </button>
              </form>
              {error ? <p className={styles.empty}>{error}</p> : null}

              <div className={styles.messages}>
                {messages.map((message) => (
                  <article
                    className={`${styles.message} ${
                      message.role === "user" ? styles.messageUser : ""
                    }`}
                    key={message.id}
                  >
                    <small>{roleLabels[message.role]}</small>
                    <p>{message.body}</p>
                  </article>
                ))}
              </div>
            </section>

            <aside className={styles.stack}>
              <article className={styles.card}>
                <div className={styles.cardHead}>
                  <h3>현재 실행</h3>
                  <span className={styles.tag}>
                    {run ? labelFor(run.workflowType, workflowLabels) : "없음"}
                  </span>
                </div>
                <p className={styles.muted}>
                  {run?.output?.summary ??
                    "아직 선택된 AI 에이전트 실행이 없습니다."}
                </p>
              </article>

              {run?.actions.length ? (
                run.actions.map((action) => (
                  <article
                    className={`${styles.actionCard} ${
                      action.status === "confirmed" ? styles.actionCardConfirmed : ""
                    } ${
                      action.status === "rejected" ? styles.actionCardRejected : ""
                    }`}
                    key={action.id}
                  >
                    <div className={styles.cardHead}>
                      <div>
                        <h3>{action.type}</h3>
                        <p className={styles.muted}>
                          {labelFor(action.source, sourceLabels)} /{" "}
                          {labelFor(action.status, statusLabels)}
                        </p>
                      </div>
                    </div>
                    <code>{JSON.stringify(action.payload, null, 2)}</code>
                    <div className={styles.buttonRow}>
                      <button
                        className={styles.secondaryButton}
                        disabled={action.status !== "waiting_confirmation"}
                        onClick={() => transitionAction(action.id, "approve")}
                        type="button"
                      >
                        승인
                      </button>
                      <button
                        className={styles.dangerButton}
                        disabled={action.status !== "waiting_confirmation"}
                        onClick={() => transitionAction(action.id, "reject")}
                        type="button"
                      >
                        거절
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className={styles.empty}>
                  AI 에이전트를 실행하면 승인할 작업 제안이 여기에 표시됩니다.
                </div>
              )}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
