import { Suspense } from "react";
import { AuthGuard } from "../../components/auth/AuthGuard";
import { WorkspaceEntryRedirect } from "../../components/workspace/WorkspaceEntryRedirect";

export default function WorkspaceEntryPage() {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceEntryRedirect />
      </AuthGuard>
    </Suspense>
  );
}
