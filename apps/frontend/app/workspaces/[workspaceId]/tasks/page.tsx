import { Suspense } from "react";
import { AuthGuard } from "../../../../components/auth/AuthGuard";
import { WorkspaceFeatureEntry } from "../../../../components/workspace/WorkspaceFeatureEntry";
import { mockWorkspaces } from "../../../../lib/workspace/workspaceClient.mjs";

type WorkspaceFeaturePageProps = {
  params: {
    workspaceId: string;
  };
};

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

export default function WorkspaceTasksPage({
  params,
}: WorkspaceFeaturePageProps) {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceFeatureEntry
          surface="tasks"
          workspaceId={params.workspaceId}
        />
      </AuthGuard>
    </Suspense>
  );
}
