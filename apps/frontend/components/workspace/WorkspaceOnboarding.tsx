"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  workspaceDashboardHref,
  workspaceEntryHref,
  writeStoredWorkspaceId,
} from "../../lib/workspace/currentWorkspace.mjs";
import { createWorkspaceClient } from "../../lib/workspace/workspaceClient.mjs";
import {
  writeWorkspaceOnboardingPayload,
  writeWorkspacePlanningOnboardingSeed,
} from "../../lib/workspace/workspaceOnboardingSeed.mjs";
import {
  AgentOnboardingFlow,
  type AgentOnboardingWorkspacePayload,
} from "../agent/AgentOnboardingFlow";
import { AgentOnboardingReview } from "../agent/AgentOnboardingReview";

function text(value: unknown) {
  if (typeof value !== "string") return "";

  return value.trim();
}

function buildWorkspaceDescription(payload: AgentOnboardingWorkspacePayload) {
  const onboarding = payload.onboarding ?? payload.planningSeed ?? {};
  const description = [
    `목표: ${text(onboarding.goal)}`,
    `해결할 문제: ${text(onboarding.problem)}`,
    `대상 사용자: ${text(onboarding.targetUser)}`,
    `기간: ${text(onboarding.duration)}`,
    `팀 규모: ${String(onboarding.teamSize ?? "").trim()}`,
    `경험 수준: ${text(onboarding.experienceLevel)}`,
    `최종 산출물: ${text(onboarding.outputGoal)}`,
  ]
    .filter((line) => !line.endsWith(": "))
    .join("\n");

  return description.length > 500
    ? `${description.slice(0, 497)}...`
    : description;
}

function withWorkspaceId(
  payload: AgentOnboardingWorkspacePayload,
  workspaceId: string,
): AgentOnboardingWorkspacePayload {
  return {
    ...payload,
    taskCandidates: payload.taskCandidates.map((candidate) => ({
      ...candidate,
      workspaceId,
    })),
    milestoneCandidates: payload.milestoneCandidates.map((candidate) => ({
      ...candidate,
      workspaceId,
    })),
  };
}

export function WorkspaceOnboarding() {
  const router = useRouter();
  const [reviewPayload, setReviewPayload] =
    useState<AgentOnboardingWorkspacePayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function createWorkspace(payload: AgentOnboardingWorkspacePayload) {
    const onboarding = payload.onboarding ?? payload.planningSeed ?? {};
    const workspaceClient = createWorkspaceClient({
      mock: {
        workspaces: [],
      },
    });

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const workspace = await workspaceClient.createWorkspace({
        name: text(payload.name) || text(onboarding.workspaceTitle) || "새 워크스페이스",
        description: buildWorkspaceDescription(payload) || text(payload.description),
        type: payload.type ?? "side_project",
        onboarding,
      });
      const payloadWithWorkspaceId = withWorkspaceId(payload, workspace.id);

      writeStoredWorkspaceId(workspace.id);
      writeWorkspacePlanningOnboardingSeed({
        workspaceId: workspace.id,
        values: payloadWithWorkspaceId.planningSeed ?? payloadWithWorkspaceId.onboarding,
      });
      writeWorkspaceOnboardingPayload({
        workspaceId: workspace.id,
        payload: payloadWithWorkspaceId,
      });
      router.replace(workspaceDashboardHref(workspace.id));
    } catch (error) {
      setSubmitting(false);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "워크스페이스를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    }
  }

  if (!reviewPayload) {
    return (
      <main className="workspace-onboarding-shell workspace-onboarding-agent-shell">
        <AgentOnboardingFlow
          className="workspace-agent-onboarding-flow"
          disabled={submitting}
          onCancel={() => router.replace(workspaceEntryHref())}
          onComplete={(payload) => {
            setReviewPayload(payload);
            setErrorMessage(null);
          }}
        />
        {errorMessage ? (
          <p className="workspace-onboarding-error">{errorMessage}</p>
        ) : null}
      </main>
    );
  }

  return (
    <main className="workspace-onboarding-shell">
      <AgentOnboardingReview
        className="workspace-agent-onboarding-review"
        disabled={submitting}
        onBack={() => {
          setReviewPayload(null);
          setErrorMessage(null);
        }}
        onChange={(payload) => {
          setReviewPayload(payload);
          setErrorMessage(null);
        }}
        onConfirm={createWorkspace}
        payload={reviewPayload}
      />
      {errorMessage ? (
        <p className="workspace-onboarding-error">{errorMessage}</p>
      ) : null}
    </main>
  );
}
