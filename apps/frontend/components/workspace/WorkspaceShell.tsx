"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { useEffect, useState } from "react";
import { CurrentUserAvatar } from "../auth/CurrentUserAvatar";
import { LogoutButton } from "../auth/LogoutButton";
import {
  workspaceCanvasHref,
  workspaceDashboardHref,
} from "../../lib/workspace/currentWorkspace.mjs";
import { CurrentWorkspaceSwitcher } from "./CurrentWorkspaceSwitcher";

export type WorkspaceNavSection =
  | "dashboard"
  | "tasks"
  | "github"
  | "progress"
  | "canvas"
  | "meetings"
  | "reviews";

export type WorkspaceNavCounts = {
  tasks?: number;
  pullRequests?: number;
};

type WorkspaceSidebarProps = {
  workspaceId: string | null;
  active: WorkspaceNavSection;
  counts?: WorkspaceNavCounts;
  id?: string;
  label?: string;
};

type WorkspaceTopbarProps = {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
};

type WorkspaceShellProps = {
  workspaceId: string | null;
  active: WorkspaceNavSection;
  eyebrow: string;
  title: string;
  counts?: WorkspaceNavCounts;
  children: React.ReactNode;
  className?: string;
  workspaceClassName?: string;
  topbarActions?: React.ReactNode;
};

type NavLinkItem = {
  href: string;
  label: string;
  active?: boolean;
  badge?: number;
};

function navItemClass(active: boolean) {
  return active ? "nav-item active" : "nav-item";
}

function workspacePath(workspaceId: string, segment: string) {
  return `${workspaceDashboardHref(workspaceId)}/${segment}`;
}

function formatRecordingElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function workspaceQueryPath(
  workspaceId: string,
  segment: string,
  view: string,
) {
  const params = new URLSearchParams({ view });

  return `${workspacePath(workspaceId, segment)}?${params.toString()}`;
}

function disabledNavItem(label: string, badge?: number) {
  return (
    <div key={label} className="nav-item" aria-disabled="true">
      <span>{label}</span>
      {typeof badge === "number" ? <b>{badge}</b> : null}
    </div>
  );
}

function navLink({ href, label, active, badge }: NavLinkItem) {
  return (
    <Link
      href={href}
      className={navItemClass(Boolean(active))}
      aria-current={active ? "page" : undefined}
      key={label}
    >
      <span>{label}</span>
      {typeof badge === "number" ? <b>{badge}</b> : null}
    </Link>
  );
}

function navSubLink({ href, label, active, badge }: NavLinkItem) {
  return (
    <Link
      href={href}
      className={active ? "nav-sub-item active" : "nav-sub-item"}
      aria-current={active ? "page" : undefined}
      key={label}
    >
      <span>{label}</span>
      {typeof badge === "number" ? <b>{badge}</b> : null}
    </Link>
  );
}

function navGroup({
  label,
  active,
  badge,
  children,
}: {
  label: string;
  active: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <details className="nav-group" open={active} key={label}>
      <summary className={navItemClass(active)}>
        <span>{label}</span>
        <span className="nav-group-meta">
          {typeof badge === "number" ? <b>{badge}</b> : null}
          <i aria-hidden="true">⌄</i>
        </span>
      </summary>
      <div className="nav-sub-list">{children}</div>
    </details>
  );
}

function TopbarRecordingControl() {
  const [recording, setRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!recording) return undefined;

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [recording]);

  function startRecording() {
    setElapsedSeconds(0);
    setRecording(true);
  }

  function endRecording() {
    setRecording(false);
  }

  return (
    <div className="topbar-recording-control">
      {recording ? (
        <>
          <span className="topbar-recording-status" aria-live="polite">
            <span aria-hidden="true" />
            <b>REC</b>
            <code>{formatRecordingElapsed(elapsedSeconds)}</code>
          </span>
          <button
            className="topbar-recording-end"
            onClick={endRecording}
            type="button"
          >
            회의 녹화 종료
          </button>
        </>
      ) : (
        <button
          className="topbar-recording-start"
          onClick={startRecording}
          type="button"
        >
          회의 녹화
        </button>
      )}
    </div>
  );
}

export function WorkspaceSidebar({
  workspaceId,
  active,
  counts = {},
  id,
  label = "워크스페이스 탐색",
}: WorkspaceSidebarProps) {
  const pathname = usePathname() ?? "";
  const taskGroupActive =
    active === "tasks" || active === "github" || active === "progress";
  const meetingGroupActive = active === "meetings";
  const reviewGroupActive = active === "reviews";
  const meetingVoicePath = workspaceId
    ? workspacePath(workspaceId, "meetings/voice")
    : "";
  const meetingReportsPath = workspaceId
    ? workspacePath(workspaceId, "meetings/reports")
    : "";

  return (
    <aside id={id} className="sidebar" aria-label={label}>
      <div className="brand">
        <CurrentWorkspaceSwitcher />
      </div>
      <nav className="nav-list" aria-label={label}>
        {workspaceId
          ? [
              navLink({
                href: workspaceDashboardHref(workspaceId),
                label: "대시보드",
                active: active === "dashboard",
              }),
              navGroup({
                label: "작업",
                active: taskGroupActive,
                badge: counts.tasks,
                children: [
                  navSubLink({
                    href: workspacePath(workspaceId, "tasks"),
                    label: "작업 보드",
                    active: active === "tasks",
                  }),
                  navSubLink({
                    href: workspacePath(workspaceId, "github"),
                    label: "GitHub",
                    active: active === "github",
                  }),
                  navSubLink({
                    href: workspacePath(workspaceId, "progress"),
                    label: "진행률",
                    active: active === "progress",
                  }),
                ],
              }),
              navGroup({
                label: "회의 / 리포트",
                active: meetingGroupActive,
                children: [
                  navSubLink({
                    href: meetingVoicePath,
                    label: "음성 회의",
                    active: pathname === meetingVoicePath,
                  }),
                  navSubLink({
                    href: meetingReportsPath,
                    label: "리포트",
                    active: pathname === meetingReportsPath,
                  }),
                ],
              }),
              navLink({
                href: workspaceCanvasHref(workspaceId),
                label: "캔버스",
                active: active === "canvas",
              }),
              navGroup({
                label: "코드 리뷰",
                active: reviewGroupActive,
                badge: counts.pullRequests,
                children: [
                  navSubLink({
                    href: workspacePath(workspaceId, "reviews"),
                    label: "PR 선택",
                    active: active === "reviews",
                  }),
                  navSubLink({
                    href: workspaceQueryPath(
                      workspaceId,
                      "reviews",
                      "analysis",
                    ),
                    label: "분석",
                  }),
                  navSubLink({
                    href: workspaceQueryPath(
                      workspaceId,
                      "reviews",
                      "changed-files",
                    ),
                    label: "변경 파일",
                  }),
                  navSubLink({
                    href: workspaceQueryPath(workspaceId, "reviews", "graph"),
                    label: "리뷰 그래프",
                  }),
                  navSubLink({
                    href: workspaceQueryPath(
                      workspaceId,
                      "reviews",
                      "artifacts",
                    ),
                    label: "아티팩트",
                  }),
                ],
              }),
            ]
          : [
              disabledNavItem("대시보드"),
              disabledNavItem("작업"),
              disabledNavItem("회의 / 리포트"),
              disabledNavItem("캔버스"),
              disabledNavItem("코드 리뷰"),
            ]}
        {disabledNavItem("설정")}
      </nav>
    </aside>
  );
}

export function WorkspaceTopbar({
  eyebrow,
  title,
  children,
}: WorkspaceTopbarProps) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <div className="topbar-actions">
        {children}
        <TopbarRecordingControl />
        <LogoutButton />
        <CurrentUserAvatar />
      </div>
    </header>
  );
}

export function WorkspaceShell({
  workspaceId,
  active,
  eyebrow,
  title,
  counts,
  children,
  className = "dashboard-shell",
  workspaceClassName = "workspace",
  topbarActions,
}: WorkspaceShellProps) {
  return (
    <main className={className}>
      <WorkspaceSidebar
        workspaceId={workspaceId}
        active={active}
        counts={counts}
      />
      <section className={workspaceClassName}>
        <WorkspaceTopbar eyebrow={eyebrow} title={title}>
          {topbarActions}
        </WorkspaceTopbar>
        {children}
      </section>
    </main>
  );
}
