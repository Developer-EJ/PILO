import { redirect } from "next/navigation";

type WorkspacePlanningPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspacePlanningPage({
  params,
}: WorkspacePlanningPageProps) {
  const { workspaceId } = await params;

  redirect(`/workspaces/${encodeURIComponent(workspaceId)}`);
}
