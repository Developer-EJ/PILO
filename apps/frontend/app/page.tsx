import { Suspense } from "react";
import { AuthGuard } from "../components/auth/AuthGuard";
import { WorkspaceDashboard } from "../components/workspace/WorkspaceDashboard";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <WorkspaceDashboard />
      </AuthGuard>
    </Suspense>
  );
}
