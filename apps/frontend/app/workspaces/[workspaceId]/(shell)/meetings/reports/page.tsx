import { MeetingReportsBoardPage } from "../../../../../../components/meeting/MeetingExperiencePages";

type WorkspaceMeetingReportsPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceMeetingReportsPage({
  params,
}: WorkspaceMeetingReportsPageProps) {
  const { workspaceId } = await params;

  return <MeetingReportsBoardPage workspaceId={workspaceId} />;
}
