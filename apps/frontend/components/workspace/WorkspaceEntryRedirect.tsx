"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  readStoredWorkspaceId,
  resolveWorkspaceEntryDestination,
  workspaceOnboardingHref,
  writeStoredWorkspaceId,
} from "../../lib/workspace/currentWorkspace.mjs";
import { createWorkspaceClient } from "../../lib/workspace/workspaceClient.mjs";

export function WorkspaceEntryRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function resolveWorkspaceEntry() {
      const workspaceClient = createWorkspaceClient({
        mock: {
          workspaces: [],
        },
      });
      const workspaces = await workspaceClient.listWorkspaces();
      const destination = resolveWorkspaceEntryDestination({
        workspaces,
        storedWorkspaceId: readStoredWorkspaceId(),
      });

      if (cancelled) return;

      if (destination.workspace?.id) {
        writeStoredWorkspaceId(destination.workspace.id);
      }

      router.replace(destination.href);
    }

    resolveWorkspaceEntry().catch(() => {
      if (!cancelled) {
        router.replace(workspaceOnboardingHref());
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
