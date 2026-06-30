import { TaskWorkspace } from "../../../../../components/task/TaskWorkspace";

type WorkspaceTasksPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceTasksPage({
  params,
}: WorkspaceTasksPageProps) {
  const { workspaceId } = await params;

  return <TaskWorkspace view="tasks" workspaceId={workspaceId} />;
}
