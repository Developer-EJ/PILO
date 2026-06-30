"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  workspaceDashboardHref,
  workspaceEntryHref,
  writeStoredWorkspaceId,
} from "../../lib/workspace/currentWorkspace.mjs";
import { createWorkspaceClient } from "../../lib/workspace/workspaceClient.mjs";
import { writeWorkspacePlanningOnboardingSeed } from "../../lib/workspace/workspaceOnboardingSeed.mjs";
import {
  AgentOnboardingFlow,
  type AgentOnboardingWorkspacePayload,
} from "../agent/AgentOnboardingFlow";

type WorkspaceOnboardingValues = {
  title: string;
  goal: string;
  problem: string;
  targetUsers: string;
  duration: string;
  teamSize: string;
  experienceLevel: string;
  finalDeliverable: string;
};

function text(value: unknown) {
  if (typeof value !== "string") return "";

  return value.trim();
}

function teamSizeText(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return text(value);
}

function toWorkspaceOnboardingValues(
  payload: AgentOnboardingWorkspacePayload,
): WorkspaceOnboardingValues {
  const onboarding = payload.onboarding ?? payload.planningSeed ?? {};

  return {
    title: text(onboarding.workspaceTitle) || text(payload.name) || "새 워크스페이스",
    goal: text(onboarding.goal),
    problem: text(onboarding.problem),
    targetUsers: text(onboarding.targetUser),
    duration: text(onboarding.duration),
    teamSize: teamSizeText(onboarding.teamSize),
    experienceLevel: text(onboarding.experienceLevel),
    finalDeliverable: text(onboarding.outputGoal),
  };
}

function buildWorkspaceDescription(values: WorkspaceOnboardingValues) {
  const description = [
    `목표: ${values.goal}`,
    `해결할 문제: ${values.problem}`,
    `대상 사용자: ${values.targetUsers}`,
    `기간: ${values.duration}`,
    `팀 규모: ${values.teamSize}`,
    `경험 수준: ${values.experienceLevel}`,
    `최종 산출물: ${values.finalDeliverable}`,
  ]
    .filter((line) => !line.endsWith(": "))
    .join("\n");

  return description.length > 500
    ? `${description.slice(0, 497)}...`
    : description;
}

export function WorkspaceOnboarding() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm(payload: AgentOnboardingWorkspacePayload) {
    const values = toWorkspaceOnboardingValues(payload);
    const workspaceClient = createWorkspaceClient({
      mock: {
        workspaces: [],
      },
    });

    setSubmitting(true);

    try {
      const workspace = await workspaceClient.createWorkspace({
        name: values.title,
        description: buildWorkspaceDescription(values) || payload.description,
        type: payload.type ?? "side_project",
        onboarding: values,
      });

      writeStoredWorkspaceId(workspace.id);
      writeWorkspacePlanningOnboardingSeed({
        workspaceId: workspace.id,
        values: payload.planningSeed ?? payload.onboarding ?? values,
      });
      router.replace(workspaceDashboardHref(workspace.id));
    } catch (error) {
      setSubmitting(false);
      throw new Error(
        "워크스페이스를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  }

  return (
    <main className="workspace-onboarding-shell workspace-onboarding-agent-shell">
      <AgentOnboardingFlow
        className="workspace-agent-onboarding-flow"
        disabled={submitting}
        onCancel={() => router.replace(workspaceEntryHref())}
        onConfirm={handleConfirm}
      />
    </main>
  );
}
