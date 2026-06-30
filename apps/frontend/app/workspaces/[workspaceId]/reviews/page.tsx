import { Suspense } from "react";
import { AuthGuard } from "../../../../components/auth/AuthGuard";
import { ReviewRoomWorkspace } from "../../../../components/review/ReviewRoomWorkspace";
import { mockWorkspaces } from "../../../../lib/workspace/workspaceClient.mjs";

type WorkspaceReviewsPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

export default async function WorkspaceReviewsPage({
  params,
}: WorkspaceReviewsPageProps) {
  const { workspaceId } = await params;

  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <ReviewRoomWorkspace workspaceId={workspaceId} />
      </AuthGuard>
    </Suspense>
  );
}
