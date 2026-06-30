"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { WorkspaceCanvas } from "./WorkspaceCanvas";
import { WorkspaceCanvasBoards } from "./WorkspaceCanvasBoards";
import { WorkspaceShell } from "./WorkspaceShell";
import { extractWorkspaceIdFromPathname } from "../../lib/workspace/currentWorkspace.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";

export function WorkspaceCanvasRoute() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const boardId = searchParams.get("boardId") ?? undefined;
  const workspaceId =
    extractWorkspaceIdFromPathname(pathname) ?? mockWorkspaces[0].id;

  return boardId ? (
    <WorkspaceCanvas boardId={boardId} />
  ) : (
    <WorkspaceShell
      workspaceId={workspaceId}
      active="canvas"
      eyebrow="캔버스"
      title="캔버스 보드"
    >
      <WorkspaceCanvasBoards />
    </WorkspaceShell>
  );
}
