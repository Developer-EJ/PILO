"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function WorkspaceEntryTransition() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active =
    searchParams.get("auth") === "success" ||
    searchParams.get("status") === "success";

  useEffect(() => {
    if (!active) return;

    document
      .querySelector(".login-canvas-shell")
      ?.classList.add("is-entering-workspace");

    const timeoutId = window.setTimeout(() => {
      router.replace("/");
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
      document
        .querySelector(".login-canvas-shell")
        ?.classList.remove("is-entering-workspace");
    };
  }, [active, router]);

  return null;
}
