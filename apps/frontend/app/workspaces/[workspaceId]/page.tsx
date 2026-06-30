import { mockWorkspaces } from "../../../lib/workspace/workspaceClient.mjs";
import { Suspense } from "react";
import { AuthGuard } from "../../../components/auth/AuthGuard";
import { WorkspaceDashboard } from "../../../components/workspace/WorkspaceDashboard";

type WorkspaceDashboardPageProps = {
  params: {
    workspaceId: string;
  };
};

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

export default function WorkspaceDashboardPage({
  params,
}: WorkspaceDashboardPageProps) {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceDashboard workspaceId={params.workspaceId} />
      </AuthGuard>
    </Suspense>
  );
}
