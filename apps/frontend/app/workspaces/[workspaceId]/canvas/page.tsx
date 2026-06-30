import { Suspense } from "react";
import { AuthGuard } from "../../../../components/auth/AuthGuard";
import { WorkspaceCanvasRoute } from "../../../../components/workspace/WorkspaceCanvasRoute";

export default function WorkspaceCanvasPage() {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceCanvasRoute />
      </AuthGuard>
    </Suspense>
  );
}
