import { Suspense } from "react";
import { MeetingWorkspace } from "../../../components/meeting/MeetingWorkspace";

export default function MeetingsPage() {
  return (
    <Suspense fallback={null}>
      <MeetingWorkspace />
    </Suspense>
  );
}
