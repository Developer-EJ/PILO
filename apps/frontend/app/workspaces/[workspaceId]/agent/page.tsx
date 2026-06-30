import { Suspense } from "react";
import { AuthGuard } from "../../../../components/auth/AuthGuard";
import { AgentPlanningWorkspace } from "../../../../components/agent/AgentPlanningWorkspace";
import { mockWorkspaces } from "../../../../lib/workspace/workspaceClient.mjs";

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

type WorkspaceAgentPageProps = {
  params: {
    workspaceId: string;
  };
};

export default function WorkspaceAgentPage({
  params,
}: WorkspaceAgentPageProps) {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <AgentPlanningWorkspace workspaceId={params.workspaceId} />
      </AuthGuard>
    </Suspense>
  );
}
