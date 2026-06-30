"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { WorkspaceSidebar } from "../workspace/WorkspaceSidebar";

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
      sourceDraftId?: string | null;
      sourceDraftType?: string | null;
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

function resolveWorkspaceId(pathname: string, routeWorkspaceId?: string) {
  const urlWorkspaceId =
    routeWorkspaceId ?? extractWorkspaceIdFromPathname(pathname);

  if (urlWorkspaceId) {
    return urlWorkspaceId;
  }

  const selection = resolveCurrentWorkspaceSelection({
    workspaces: mockWorkspaces,
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

function textPayloadValue(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];

  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

function actionSourceDraftId(action: AgentAction) {
  return textPayloadValue(action.payload, "sourceId") ?? action.id;
}

function ownerResultForAction(
  action: AgentAction,
  ownerApiResults: PlanDraftDetail["approval"]["ownerApiResults"],
) {
  if (action.type !== "task.create.draft") {
    return null;
  }

  const sourceDraftId = actionSourceDraftId(action);

  return (
    ownerApiResults.find(
      (result) =>
        result.owner === "task" &&
        result.operation === "task.create" &&
        result.sourceDraftId === sourceDraftId,
    ) ??
    ownerApiResults.find(
      (result) => result.owner === "task" && result.operation === "task.create",
    ) ??
    null
  );
}

function ownerOperationLabel(
  result: PlanDraftDetail["approval"]["ownerApiResults"][number],
) {
  if (result.owner === "task" && result.operation === "task.create") {
    return "task draft create";
  }

  return result.operation;
}

function ownerResultSummary(
  result: PlanDraftDetail["approval"]["ownerApiResults"][number],
) {
  const operation = ownerOperationLabel(result);

  if (
    result.owner === "task" &&
    result.operation === "task.create" &&
    result.status === "succeeded" &&
    result.targetEntityId
  ) {
    return `${operation}: TaskDraft ${result.targetEntityId}`;
  }

  if (result.status === "succeeded" && result.targetEntityId) {
    return `${operation}: ${result.targetEntityId}`;
  }

  if (result.status === "succeeded") {
    return result.owner === "task" && result.operation === "task.create"
      ? `${operation}: succeeded without a returned TaskDraft id`
      : `${operation}: succeeded without a returned entity id`;
  }

  return `${operation}: ${statusLabel(result.status)}`;
}

function actionOutcomeMessage(
  action: AgentAction,
  ownerResult: PlanDraftDetail["approval"]["ownerApiResults"][number] | null,
) {
  const payloadErrorMessage = textPayloadValue(action.payload, "errorMessage");
  const ownerErrorMessage =
    typeof ownerResult?.errorMessage === "string" &&
    ownerResult.errorMessage.trim().length
      ? ownerResult.errorMessage.trim()
      : null;

  if (action.status === "waiting_confirmation") {
    return null;
  }

  if (action.status === "rejected") {
    return "Rejected; no owner API write was attempted.";
  }

  if (action.status === "failed") {
    return (
      payloadErrorMessage ??
      ownerErrorMessage ??
      "Owner API write failed; no persisted owner result was returned."
    );
  }

  if (action.type === "planning.approve") {
    return "Plan approval is local only; no owner API write was executed.";
  }

  if (action.type === "task.create.draft") {
    if (ownerResult?.status === "succeeded" && ownerResult.targetEntityId) {
      return `TaskDraft created: ${ownerResult.targetEntityId}`;
    }

    if (ownerResult?.status === "failed") {
      return ownerErrorMessage ?? "TaskDraft creation failed.";
    }

    if (action.executedAt) {
      return "Owner API reported execution, but no TaskDraft id was returned.";
    }

    return "TaskDraft was not created.";
  }

  return action.executedAt
    ? "Executed by owner API."
    : "Owner API write not executed.";
}

export function AgentPlanningWorkspace({
  workspaceId: routeWorkspaceId,
}: {
  workspaceId?: string;
}) {
  const pathname = usePathname() ?? "/";
  const workspaceId = useMemo(
    () => resolveWorkspaceId(pathname, routeWorkspaceId),
    [pathname, routeWorkspaceId],
  );
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
    const timeoutId = window.setTimeout(() => {
      void createDraft(defaultProjectStartInput);
    }, 0);

    return () => window.clearTimeout(timeoutId);
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

  async function decideAction(
    action: AgentAction,
    decision: "approve" | "reject",
  ) {
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
      <WorkspaceSidebar
        className="agent-sidebar"
        items={navItems}
        ariaLabel="Agent workspace navigation"
        navAriaLabel="Agent navigation"
      />

      <section className="agent-workspace-main">
        <header className="agent-topbar">
          <div>
            <p className="eyebrow">AGENT / PLANNING</p>
            <h1>Project start runner</h1>
          </div>
          <div className="agent-run-status">
            <span
              className={`agent-status-dot tone-${statusTone(run?.status ?? "pending")}`}
            />
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

            <button
              className="agent-primary-button"
              disabled={loading}
              type="submit"
            >
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
                      {planDraft.techStack.frontend} /{" "}
                      {planDraft.techStack.backend} /{" "}
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
                run.actions.map((action) => {
                  const ownerResult = ownerResultForAction(
                    action,
                    planDraft?.approval.ownerApiResults ?? [],
                  );
                  const outcomeMessage = actionOutcomeMessage(
                    action,
                    ownerResult,
                  );

                  return (
                    <article className="agent-action-row" key={action.id}>
                      <div>
                        <strong>{actionTitle(action)}</strong>
                        <span>
                          {action.type} from {action.source}
                        </span>
                      </div>
                      <b
                        className={`agent-pill tone-${statusTone(action.status)}`}
                      >
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
                      ) : outcomeMessage ? (
                        <small>{outcomeMessage}</small>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <p className="agent-empty">No Agent actions are waiting.</p>
              )}
            </div>

            {planDraft?.approval.ownerApiResults.length ? (
              <div className="agent-owner-results">
                <h3>Owner API handoff</h3>
                {planDraft.approval.ownerApiResults.map((result) => (
                  <p
                    key={`${result.owner}-${result.operation}-${result.targetEntityId ?? result.status}`}
                  >
                    <strong>{result.owner}</strong>
                    <span>{ownerResultSummary(result)}</span>
                    {result.errorMessage ? (
                      <small>{result.errorMessage}</small>
                    ) : null}
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
