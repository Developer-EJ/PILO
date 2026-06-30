import { Suspense, type ReactNode } from "react";
import { AuthGuard } from "../../../../components/auth/AuthGuard";
import { WorkspaceRouteShell } from "../../../../components/workspace/WorkspaceRouteShell";

type WorkspaceShellLayoutProps = {
  children: ReactNode;
  params: Promise<{
    workspaceId: string;
  }>;
};

export default async function WorkspaceShellLayout({
  children,
  params,
}: WorkspaceShellLayoutProps) {
  const { workspaceId } = await params;

  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceRouteShell workspaceId={workspaceId}>
          {children}
        </WorkspaceRouteShell>
      </AuthGuard>
    </Suspense>
  );
}
