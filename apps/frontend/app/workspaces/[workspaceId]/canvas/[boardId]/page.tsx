import { Suspense } from "react";
import { AuthGuard } from "../../../../../components/auth/AuthGuard";
import { WorkspaceCanvas } from "../../../../../components/workspace/WorkspaceCanvas";
import { createMockCanvasBoardDetail } from "../../../../../lib/workspace/canvasClient.mjs";
import { mockWorkspaces } from "../../../../../lib/workspace/workspaceClient.mjs";

type WorkspaceCanvasBoardPageProps = {
  params: Promise<{
    boardId: string;
  }>;
};

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
    boardId: createMockCanvasBoardDetail(workspace.id).id,
  }));
}

export default async function WorkspaceCanvasBoardPage({
  params,
}: WorkspaceCanvasBoardPageProps) {
  const { boardId } = await params;

  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceCanvas boardId={boardId} />
      </AuthGuard>
    </Suspense>
  );
}
