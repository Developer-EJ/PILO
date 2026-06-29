import { Suspense } from "react";
import { AuthGuard } from "../../../../components/auth/AuthGuard";
import { WorkspaceGithub } from "../../../../components/github/WorkspaceGithub";
import { mockWorkspaces } from "../../../../lib/workspace/workspaceClient.mjs";

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

export default function WorkspaceGithubPage() {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceGithub />
      </AuthGuard>
    </Suspense>
  );
}
