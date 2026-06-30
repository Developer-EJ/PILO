import type { ReactNode } from "react";
import { mockWorkspaces } from "../../../lib/workspace/workspaceClient.mjs";

type WorkspaceLayoutProps = {
  children: ReactNode;
};

export function generateStaticParams() {
  return mockWorkspaces.map((workspace) => ({
    workspaceId: workspace.id,
  }));
}

export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  return children;
}
