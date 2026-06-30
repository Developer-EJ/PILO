"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { WorkspaceShell, type WorkspaceNavSection } from "./WorkspaceShell";

type WorkspaceRouteShellProps = {
  workspaceId: string;
  children: ReactNode;
};

type WorkspaceRouteCopy = {
  active: WorkspaceNavSection;
  eyebrow: string;
  title: string;
};

const routeCopyBySegment: Record<string, WorkspaceRouteCopy> = {
  tasks: {
    active: "tasks",
    eyebrow: "작업",
    title: "작업 보드",
  },
  github: {
    active: "github",
    eyebrow: "작업 / GitHub",
    title: "GitHub 연동",
  },
  progress: {
    active: "progress",
    eyebrow: "작업 / 진행률",
    title: "진행률과 위험 상태",
  },
  meetings: {
    active: "meetings",
    eyebrow: "회의 / 리포트",
    title: "회의 작업 공간",
  },
  reviews: {
    active: "reviews",
    eyebrow: "코드 리뷰",
    title: "리뷰 작업 공간",
  },
};

function routeCopyFromPathname(pathname: string): WorkspaceRouteCopy {
  const segment = pathname.split("/").filter(Boolean)[2] ?? "dashboard";

  return (
    routeCopyBySegment[segment] ?? {
      active: "dashboard",
      eyebrow: "대시보드",
      title: "팀 대시보드",
    }
  );
}

export function WorkspaceRouteShell({
  workspaceId,
  children,
}: WorkspaceRouteShellProps) {
  const pathname = usePathname() ?? "";
  const routeCopy = routeCopyFromPathname(pathname);

  return (
    <WorkspaceShell
      workspaceId={workspaceId}
      active={routeCopy.active}
      eyebrow={routeCopy.eyebrow}
      title={routeCopy.title}
      workspaceClassName={`workspace workspace-route workspace-route-${routeCopy.active}`}
    >
      {children}
    </WorkspaceShell>
  );
}
