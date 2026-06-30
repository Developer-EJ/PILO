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
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspacePlanningPage({
  params,
}: WorkspacePlanningPageProps) {
  const { workspaceId } = await params;

  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <AgentPlanningWorkspace workspaceId={workspaceId} />
      </AuthGuard>
    </Suspense>
  );
}
