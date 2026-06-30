import { TaskWorkspace } from "../../../../../components/task/TaskWorkspace";

type WorkspaceProgressPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceProgressPage({
  params,
}: WorkspaceProgressPageProps) {
  const { workspaceId } = await params;

  return <TaskWorkspace view="progress" workspaceId={workspaceId} />;
}
