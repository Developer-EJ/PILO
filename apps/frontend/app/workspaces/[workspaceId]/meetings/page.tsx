import { Suspense } from "react";
import { AuthGuard } from "../../../../components/auth/AuthGuard";
import { WorkspaceMeetings } from "../../../../components/meeting/WorkspaceMeetings";
import { mockWorkspaces } from "../../../../lib/workspace/workspaceClient.mjs";

type WorkspaceMeetingsPageProps = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

export default async function WorkspaceMeetingsPage({
  params,
}: WorkspaceMeetingsPageProps) {
  const { workspaceId } = await params;

  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceMeetings workspaceId={workspaceId} />
      </AuthGuard>
    </Suspense>
  );
}
