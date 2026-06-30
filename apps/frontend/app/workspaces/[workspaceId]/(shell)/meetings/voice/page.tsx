import { VoiceMeetingsPage } from "../../../../../../components/meeting/MeetingExperiencePages";

type WorkspaceVoiceMeetingsPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceVoiceMeetingsPage({
  params,
}: WorkspaceVoiceMeetingsPageProps) {
  const { workspaceId } = await params;

  return <VoiceMeetingsPage workspaceId={workspaceId} />;
}
