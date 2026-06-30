import { ReviewRoomWorkspace } from "../../../../../components/review/ReviewRoomWorkspace";

type WorkspaceReviewsPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceReviewsPage({
  params,
}: WorkspaceReviewsPageProps) {
  const { workspaceId } = await params;

  return <ReviewRoomWorkspace workspaceId={workspaceId} />;
}
