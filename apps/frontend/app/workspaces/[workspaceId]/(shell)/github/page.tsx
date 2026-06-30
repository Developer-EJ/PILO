import { TaskWorkspace } from "../../../../../components/task/TaskWorkspace";

type WorkspaceGithubPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceGithubPage({
  params,
}: WorkspaceGithubPageProps) {
  const { workspaceId } = await params;

  return <TaskWorkspace view="github" workspaceId={workspaceId} />;
}
