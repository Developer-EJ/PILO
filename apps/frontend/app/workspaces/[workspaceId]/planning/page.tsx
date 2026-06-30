import { Suspense } from "react";
import { AuthGuard } from "../../../../components/auth/AuthGuard";
import { AgentPlanningWorkspace } from "../../../../components/agent/AgentPlanningWorkspace";
import { mockWorkspaces } from "../../../../lib/workspace/workspaceClient.mjs";

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

type WorkspacePlanningPageProps = {
  params: {
    workspaceId: string;
  };
};

export default function WorkspacePlanningPage({
  params,
}: WorkspacePlanningPageProps) {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <AgentPlanningWorkspace workspaceId={params.workspaceId} />
      </AuthGuard>
    </Suspense>
  );
}
