import { MeetingWorkspace } from "../../../../../components/meeting/MeetingWorkspace";

type WorkspaceMeetingsPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceMeetingsPage({
  params,
}: WorkspaceMeetingsPageProps) {
  const { workspaceId } = await params;

  return <MeetingWorkspace workspaceId={workspaceId} />;
}
