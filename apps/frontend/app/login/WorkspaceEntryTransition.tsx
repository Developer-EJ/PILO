"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { markMockAuthSignedIn } from "../../lib/auth/mockAuthClient.mjs";
import { resolveWorkspaceLoginNextPath } from "./loginRedirects.mjs";

export function WorkspaceEntryTransition() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active =
    searchParams.get("auth") === "success" ||
    searchParams.get("status") === "success";
  const redirectTo = resolveWorkspaceLoginNextPath(searchParams.get("next"));

  useEffect(() => {
    if (!active) return;

    markMockAuthSignedIn();

    document
      .querySelector(".login-canvas-shell")
      ?.classList.add("is-entering-workspace");

    const timeoutId = window.setTimeout(() => {
      router.replace(redirectTo);
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
      document
        .querySelector(".login-canvas-shell")
        ?.classList.remove("is-entering-workspace");
    };
  }, [active, redirectTo, router]);

  return null;
}
