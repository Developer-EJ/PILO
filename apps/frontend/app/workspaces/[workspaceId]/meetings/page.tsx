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

export default function WorkspaceMeetingsPage({
  params,
}: WorkspaceFeaturePageProps) {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceFeatureEntry
          surface="meetings"
          workspaceId={params.workspaceId}
        />
      </AuthGuard>
    </Suspense>
  );
}
