import { Suspense } from "react";
import { OAuthCallbackRelay } from "./OAuthCallbackRelay";

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallbackRelay />
    </Suspense>
  );
}
