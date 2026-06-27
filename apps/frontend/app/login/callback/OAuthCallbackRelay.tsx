"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveOAuthCallbackState } from "./oauthCallbackState.mjs";

export function OAuthCallbackRelay() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = useMemo(
    () => resolveOAuthCallbackState(searchParams),
    [searchParams],
  );

  useEffect(() => {
    router.replace(state.loginHref);
  }, [router, state.loginHref]);

  return null;
}
