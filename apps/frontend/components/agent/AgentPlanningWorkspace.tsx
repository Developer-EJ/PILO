"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createAgentPlanningClient,
  defaultProjectStartInput,
  projectStartQuestions,
} from "../../lib/agent/agentPlanningClient.mjs";
import {
  buildWorkspaceFeatureRoutes,
  buildWorkspaceFeatureTabs,
  extractWorkspaceIdFromPathname,
  readStoredWorkspaceId,
  resolveCurrentWorkspaceSelection,
} from "../../lib/workspace/currentWorkspace.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";
import { CurrentWorkspaceSwitcher } from "../workspace/CurrentWorkspaceSwitcher";

type AgentAction = {
  id: string;
  type: string;
  source: string;
  requiresConfirmation: boolean;
  payload: Record<string, unknown>;
  status: string;
  confirmedAt: string | null;
  executedAt: string | null;
};

type PlanDraftDetail = {
  id: string;
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
  };
  featureDrafts: Array<{
    id: string;
    title: string;
    description: string;
    scope: string;
    reason: string;
  }>;
  roleDrafts: Array<{
    id: string;
    member: {
      name: string;
    };
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
  };
  approval: {
    status: string;
    actionId: string;
    confirmedAt: string | null;
    executedAt: string | null;
    ownerApiResults: Array<{
      owner: string;
      operation: string;
      status: string;
      targetEntityId: string | null;
      errorMessage: string | null;
    }>;
  };
};

type AgentRunDetail = {
  id: string;
  workflowType: string;
  workflowVersion: string;
  workspaceId: string;
  status: string;
  actionRequired: boolean;
  pendingActionCount: number;
  output: {
    summary?: string;
    planDraft?: {
      detail: PlanDraftDetail;
    };
  } | null;
  actions: AgentAction[];
  trace: Array<{
    id: string;
    message: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
};

type ProjectStartInput = typeof defaultProjectStartInput;

function resolveWorkspaceId(pathname: string) {
  const selection = resolveCurrentWorkspaceSelection({
    workspaces: mockWorkspaces,
    urlWorkspaceId: extractWorkspaceIdFromPathname(pathname),
    storedWorkspaceId: readStoredWorkspaceId(),
  });

  return (
    selection.workspace?.id ??
    selection.fallbackWorkspace?.id ??
    mockWorkspaces[0].id
  );
}

function actionTitle(action: AgentAction) {
  if (typeof action.payload.title === "string") {
    return action.payload.title;
  }

  if (action.type === "planning.approve") {
    return "Approve project plan draft";
  }

  return action.type;
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function statusTone(status: string) {
  if (status === "confirmed" || status === "executed") return "success";
  if (status === "rejected" || status === "failed") return "danger";
  if (status === "waiting_confirmation") return "warning";

  return "primary";
}

export function AgentPlanningWorkspace() {
  const pathname = usePathname() ?? "/";
  const workspaceId = useMemo(() => resolveWorkspaceId(pathname), [pathname]);
  const routes = useMemo(
    () => buildWorkspaceFeatureRoutes(workspaceId),
    [workspaceId],
  );
  const isPlanningRoute = pathname.startsWith(routes.planning);
  const client = useMemo(() => createAgentPlanningClient(), []);
  const [form, setForm] = useState<ProjectStartInput>(defaultProjectStartInput);
  const [run, setRun] = useState<AgentRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionIdInFlight, setActionIdInFlight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const planDraft = run?.output?.planDraft?.detail ?? null;
  const navItems = buildWorkspaceFeatureTabs(workspaceId, {
    active: isPlanningRoute ? "planning" : "agent",
    badges: {
      agent: run?.pendingActionCount || undefined,
    },
  });

  async function createDraft(nextForm = form) {
    setLoading(true);
    setError(null);

    try {
      const nextRun = (await client.startPlanningRun(
        workspaceId,
        nextForm,
      )) as AgentRunDetail;

      setRun(nextRun);
    } catch (draftError) {
      setError("Planning run failed to start.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    createDraft(defaultProjectStartInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  function updateQuestion(questionId: string, value: string) {
    setForm((current) => ({
      ...current,
      [questionId]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createDraft();
  }

  async function decideAction(action: AgentAction, decision: "approve" | "reject") {
    if (!run) return;

    setActionIdInFlight(action.id);
    setError(null);

    try {
      if (decision === "approve") {
        await client.approveAction(action.id);
      } else {
        await client.rejectAction(action.id);
      }

      const nextRun = (await client.getRun(run.id)) as AgentRunDetail;

      setRun(nextRun);
    } catch (decisionError) {
      setError("Action status could not be updated.");
    } finally {
      setActionIdInFlight(null);
    }
  }

  return (
    <main className="agent-workspace-shell">
      <aside className="agent-sidebar" aria-label="Agent workspace navigation">
        <div className="brand">
          <CurrentWorkspaceSwitcher />
        </div>
        <nav className="nav-list" aria-label="Agent navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.active ? "nav-item active" : "nav-item"}
              aria-current={item.active ? "page" : undefined}
            >
              <span>{item.label}</span>
              {item.badge ? <b>{item.badge}</b> : null}
            </Link>
          ))}
        </nav>
      </aside>

      <section className="agent-workspace-main">
        <header className="agent-topbar">
          <div>
            <p className="eyebrow">AGENT / PLANNING</p>
            <h1>Project start runner</h1>
          </div>
          <div className="agent-run-status">
            <span className={`agent-status-dot tone-${statusTone(run?.status ?? "pending")}`} />
            <strong>{run ? statusLabel(run.status) : "starting"}</strong>
            <code>{run?.workflowType ?? "planning.generate"}</code>
          </div>
        </header>

        <section className="agent-content-grid">
          <form className="agent-question-panel" onSubmit={handleSubmit}>
            <div className="agent-section-head">
              <span>Project-start questions</span>
              <b>{loading ? "Drafting" : "Ready"}</b>
            </div>

            {projectStartQuestions.map((question) => (
              <label className="agent-field" key={question.id}>
                <span>{question.label}</span>
                {question.id === "problem" || question.id === "outputGoal" ? (
                  <textarea
                    value={form[question.id as keyof ProjectStartInput]}
                    placeholder={question.placeholder}
                    onChange={(event) =>
                      updateQuestion(question.id, event.target.value)
                    }
                  />
                ) : (
                  <input
                    value={form[question.id as keyof ProjectStartInput]}
                    placeholder={question.placeholder}
                    onChange={(event) =>
                      updateQuestion(question.id, event.target.value)
                    }
                  />
                )}
              </label>
            ))}

            <button className="agent-primary-button" disabled={loading} type="submit">
              Draft plan
            </button>
            {error ? <p className="agent-error">{error}</p> : null}
          </form>

          <section className="agent-plan-panel">
            <div className="agent-section-head">
              <span>Plan draft preview</span>
              <b>{planDraft ? statusLabel(planDraft.status) : "empty"}</b>
            </div>

            {planDraft ? (
              <>
                <div className="agent-plan-summary">
                  <h2>{planDraft.goal}</h2>
                  <p>{planDraft.problem}</p>
                  <dl>
                    <div>
                      <dt>User</dt>
                      <dd>{planDraft.targetUser}</dd>
                    </div>
                    <div>
                      <dt>Timeline</dt>
                      <dd>{planDraft.duration}</dd>
                    </div>
                    <div>
                      <dt>Output</dt>
                      <dd>{planDraft.outputGoal}</dd>
                    </div>
                  </dl>
                </div>

                <div className="agent-preview-columns">
                  <article className="agent-preview-block">
                    <h3>Tech stack</h3>
                    <p>
                      {planDraft.techStack.frontend} / {planDraft.techStack.backend} /{" "}
                      {planDraft.techStack.databaseName}
                    </p>
                    <small>{planDraft.techStack.reason}</small>
                  </article>

                  <article className="agent-preview-block">
                    <h3>First agenda</h3>
                    <p>{planDraft.firstAgendaDraft.title}</p>
                    <small>{planDraft.firstAgendaDraft.objective}</small>
                  </article>
                </div>

                <div className="agent-draft-list">
                  <h3>Feature drafts</h3>
                  {planDraft.featureDrafts.map((feature) => (
                    <article key={feature.id}>
                      <strong>{feature.title}</strong>
                      <span>{feature.scope}</span>
                      <p>{feature.description}</p>
                    </article>
                  ))}
                </div>

                <div className="agent-plan-bands">
                  <section>
                    <h3>Milestones</h3>
                    {planDraft.milestoneDrafts.map((milestone) => (
                      <p key={milestone.id}>
                        <strong>{milestone.title}</strong>
                        <span>
                          {milestone.startDate} - {milestone.endDate}
                        </span>
                      </p>
                    ))}
                  </section>
                  <section>
                    <h3>Risks</h3>
                    {planDraft.riskNotes.map((risk) => (
                      <p key={risk.id}>
                        <strong>{risk.severity}</strong>
                        <span>{risk.content}</span>
                      </p>
                    ))}
                  </section>
                </div>
              </>
            ) : (
              <p className="agent-empty">No plan draft yet.</p>
            )}
          </section>

          <section className="agent-actions-panel">
            <div className="agent-section-head">
              <span>Pending actions</span>
              <b>{run?.pendingActionCount ?? 0}</b>
            </div>

            <div className="agent-action-list">
              {run?.actions.length ? (
                run.actions.map((action) => (
                  <article className="agent-action-row" key={action.id}>
                    <div>
                      <strong>{actionTitle(action)}</strong>
                      <span>
                        {action.type} from {action.source}
                      </span>
                    </div>
                    <b className={`agent-pill tone-${statusTone(action.status)}`}>
                      {statusLabel(action.status)}
                    </b>
                    {action.status === "waiting_confirmation" ? (
                      <div className="agent-action-buttons">
                        <button
                          disabled={actionIdInFlight === action.id}
                          onClick={() => decideAction(action, "approve")}
                          type="button"
                        >
                          Approve
                        </button>
                        <button
                          disabled={actionIdInFlight === action.id}
                          onClick={() => decideAction(action, "reject")}
                          type="button"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <small>
                        {action.executedAt
                          ? "Executed by owner API"
                          : "Owner API write not executed"}
                      </small>
                    )}
                  </article>
                ))
              ) : (
                <p className="agent-empty">No Agent actions are waiting.</p>
              )}
            </div>

            {planDraft?.approval.ownerApiResults.length ? (
              <div className="agent-owner-results">
                <h3>Owner API handoff</h3>
                {planDraft.approval.ownerApiResults.map((result) => (
                  <p key={`${result.owner}-${result.operation}`}>
                    <strong>{result.owner}</strong>
                    <span>
                      {result.operation}: {result.status}
                    </span>
                  </p>
                ))}
              </div>
            ) : null}

            <div className="agent-trace">
              <h3>Local runner trace</h3>
              {run?.trace.map((entry) => (
                <p key={entry.id}>
                  <span>{entry.message}</span>
                  <code>{String(entry.metadata.runner ?? "local")}</code>
                </p>
              ))}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
