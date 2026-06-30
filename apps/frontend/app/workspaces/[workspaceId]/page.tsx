import { mockWorkspaces } from "../../../lib/workspace/workspaceClient.mjs";
import { Suspense } from "react";
import { AuthGuard } from "../../../components/auth/AuthGuard";
import { WorkspaceDashboard } from "../../../components/workspace/WorkspaceDashboard";

type WorkspaceDashboardPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

export default async function WorkspaceDashboardPage({
  params,
}: WorkspaceDashboardPageProps) {
  const { workspaceId } = await params;

  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceDashboard workspaceId={workspaceId} />
      </AuthGuard>
    </Suspense>
  );
}
