import { Suspense } from "react";
import { ReviewWorkspace } from "../../../components/review/ReviewWorkspace";

export default function ReviewsPage() {
  return (
    <Suspense fallback={null}>
      <ReviewWorkspace />
    </Suspense>
  );
}
