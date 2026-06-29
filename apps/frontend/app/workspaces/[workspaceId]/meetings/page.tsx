import { Suspense } from "react";
import { AuthGuard } from "../../../../components/auth/AuthGuard";
import { WorkspaceMeetings } from "../../../../components/meeting/WorkspaceMeetings";
import { mockWorkspaces } from "../../../../lib/workspace/workspaceClient.mjs";

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

export default function WorkspaceMeetingsPage() {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceMeetings />
      </AuthGuard>
    </Suspense>
  );
}
