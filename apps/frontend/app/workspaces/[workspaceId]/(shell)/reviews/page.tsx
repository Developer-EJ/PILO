import { ReviewWorkspace } from "../../../../../components/review/ReviewWorkspace";

type WorkspaceReviewsPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceReviewsPage({
  params,
}: WorkspaceReviewsPageProps) {
  const { workspaceId } = await params;

  return <ReviewWorkspace workspaceId={workspaceId} embedded />;
}
