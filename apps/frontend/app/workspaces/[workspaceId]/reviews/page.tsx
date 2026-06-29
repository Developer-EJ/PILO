import { Suspense } from "react";
import { AuthGuard } from "../../../../components/auth/AuthGuard";
import { ReviewRoomWorkspace } from "../../../../components/review/ReviewRoomWorkspace";
import { mockWorkspaces } from "../../../../lib/workspace/workspaceClient.mjs";

type WorkspaceReviewsPageProps = {
  params: {
    workspaceId: string;
  };
};

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

export default function WorkspaceReviewsPage({
  params,
}: WorkspaceReviewsPageProps) {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <ReviewRoomWorkspace workspaceId={params.workspaceId} />
      </AuthGuard>
    </Suspense>
  );
}
