import { Suspense } from "react";
import { AuthGuard } from "../../../../components/auth/AuthGuard";
import { WorkspaceTasks } from "../../../../components/task/WorkspaceTasks";
import { mockWorkspaces } from "../../../../lib/workspace/workspaceClient.mjs";

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

export default function WorkspaceTasksPage() {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceTasks />
      </AuthGuard>
    </Suspense>
  );
}
