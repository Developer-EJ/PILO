import { Suspense } from "react";
import { AuthGuard } from "../../../../components/auth/AuthGuard";
import { AgentPlanningWorkspace } from "../../../../components/agent/AgentPlanningWorkspace";
import { mockWorkspaces } from "../../../../lib/workspace/workspaceClient.mjs";

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

export default function WorkspaceAgentPage() {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <AgentPlanningWorkspace />
      </AuthGuard>
    </Suspense>
  );
}
