import { redirect } from "next/navigation";

type WorkspaceAgentPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceAgentPage({
  params,
}: WorkspaceAgentPageProps) {
  const { workspaceId } = await params;

  redirect(`/workspaces/${encodeURIComponent(workspaceId)}`);
}
