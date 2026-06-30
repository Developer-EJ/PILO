import { Suspense } from "react";
import { AuthGuard } from "../../../components/auth/AuthGuard";
import { WorkspaceOnboarding } from "../../../components/workspace/WorkspaceOnboarding";

export default function WorkspaceOnboardingPage() {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceOnboarding />
      </AuthGuard>
    </Suspense>
  );
}
