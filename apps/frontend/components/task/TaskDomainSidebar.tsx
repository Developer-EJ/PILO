"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  workspaceCanvasHref,
  workspaceDashboardHref,
} from "../../lib/workspace/currentWorkspace.mjs";
import styles from "./TaskWorkspace.module.css";

type TaskDomainSidebarProps = {
  workspaceId: string;
  taskCount?: number;
  connectionCount?: number;
};

function workspacePath(workspaceId: string, segment: string) {
  return `/workspaces/${encodeURIComponent(workspaceId)}/${segment}`;
}

export function taskBoardHref(workspaceId: string) {
  return workspacePath(workspaceId, "tasks");
}

export function githubWorkspaceHref(workspaceId: string) {
  return workspacePath(workspaceId, "github");
}

export function progressWorkspaceHref(workspaceId: string) {
  return workspacePath(workspaceId, "progress");
}

export function TaskDomainSidebar({
  workspaceId,
  taskCount = 0,
  connectionCount = 0,
}: TaskDomainSidebarProps) {
  const pathname = usePathname() ?? "";
  const items = [
    {
      label: "작업",
      href: taskBoardHref(workspaceId),
      badge: taskCount ? String(taskCount) : undefined,
    },
    {
      label: "GitHub",
      href: githubWorkspaceHref(workspaceId),
      badge: connectionCount ? String(connectionCount) : undefined,
    },
    {
      label: "진행률",
      href: progressWorkspaceHref(workspaceId),
    },
  ];
  const utilityItems = [
    {
      label: "대시보드",
      href: workspaceDashboardHref(workspaceId),
    },
    {
      label: "캔버스",
      href: workspaceCanvasHref(workspaceId),
    },
    {
      label: "리뷰",
      href: "/reviews",
    },
  ];

  return (
    <aside className={styles.domainSidebar} aria-label="작업 도메인 탐색">
      <Link
        className={styles.sidebarBrand}
        href={workspaceDashboardHref(workspaceId)}
      >
        <span>PILO</span>
        <strong>작업 운영</strong>
      </Link>

      <nav className={styles.domainNav} aria-label="작업, GitHub, 진행률">
        {items.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={active ? styles.domainNavActive : styles.domainNavItem}
              href={item.href}
              key={item.href}
            >
              <span>{item.label}</span>
              {item.badge ? <b>{item.badge}</b> : null}
            </Link>
          );
        })}
      </nav>

      <div className={styles.sidebarDivider} />

      <nav className={styles.utilityNav} aria-label="워크스페이스 링크">
        {utilityItems.map((item) => (
          <Link href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
