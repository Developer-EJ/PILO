import { Suspense } from "react";
import { AuthGuard } from "../../../../components/auth/AuthGuard";
import { WorkspaceCanvasBoards } from "../../../../components/workspace/WorkspaceCanvasBoards";
import { mockWorkspaces } from "../../../../lib/workspace/workspaceClient.mjs";

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

export default function WorkspaceCanvasPage() {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceCanvasBoards />
      </AuthGuard>
    </Suspense>
  );
}
