"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { CurrentUserAvatar } from "../auth/CurrentUserAvatar";
import { LogoutButton } from "../auth/LogoutButton";
import { createWorkspaceDashboardFixture } from "../../lib/workspace/dashboardClient.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";
import {
  extractWorkspaceIdFromPathname,
  workspaceCanvasHref,
  workspaceDashboardHref,
} from "../../lib/workspace/currentWorkspace.mjs";
import { CurrentWorkspaceSwitcher } from "./CurrentWorkspaceSwitcher";

type CanvasEntity = {
  entityType: string;
  entityId: string;
  displayTitle: string;
  shapeType: string;
};

type CanvasNavItem = {
  label: string;
  active?: boolean;
  badge?: string;
  href?: string;
};

const canvasNavLabels = [
  "홈 / 대시보드",
  "프로젝트 시작",
  "기능 목록",
  "Task 보드",
  "회의 / Report",
  "음성채팅",
  "Canvas",
  "GitHub PR",
  "Code Review",
  "설정",
];

const canvasNodePositions = [
  { left: "8%", top: "18%" },
  { left: "42%", top: "14%" },
  { left: "28%", top: "56%" },
  { left: "66%", top: "44%" },
  { left: "58%", top: "70%" },
];

function resolveCanvasWorkspaceId(pathname: string) {
  return extractWorkspaceIdFromPathname(pathname) ?? mockWorkspaces[0].id;
}

function labelForEntity(entity: CanvasEntity) {
  if (entity.entityType === "task") return "Task";
  if (entity.entityType === "pull_request") return "PR";
  if (entity.entityType === "meeting_report") return "Meeting";
  if (entity.entityType === "github_issue") return "Issue";

  return "File";
}

function toneForEntity(entity: CanvasEntity) {
  if (entity.entityType === "task") return "task";
  if (entity.entityType === "pull_request") return "pr";
  if (entity.entityType === "meeting_report") return "meeting";
  if (entity.entityType === "github_issue") return "issue";

  return "file";
}

function buildCanvasNavItems({
  workspaceId,
  taskCount,
  pullRequestCount,
}: {
  workspaceId: string;
  taskCount: number;
  pullRequestCount: number;
}): CanvasNavItem[] {
  return canvasNavLabels.map((label, index) => {
    if (index === 0) {
      return {
        label,
        href: workspaceDashboardHref(workspaceId),
      };
    }
    if (index === 3) {
      return {
        label,
        badge: String(taskCount),
      };
    }
    if (index === 6) {
      return {
        label,
        active: true,
        href: workspaceCanvasHref(workspaceId),
      };
    }
    if (index === 7) {
      return {
        label,
        badge: String(pullRequestCount),
      };
    }

    return { label };
  });
}

export function WorkspaceCanvas() {
  const pathname = usePathname() ?? "/";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const workspaceId = useMemo(
    () => resolveCanvasWorkspaceId(pathname),
    [pathname],
  );
  const dashboard = useMemo(
    () => createWorkspaceDashboardFixture(workspaceId),
    [workspaceId],
  );
  const navItems = buildCanvasNavItems({
    workspaceId,
    taskCount: dashboard.tasks.length,
    pullRequestCount: dashboard.pullRequests.length,
  });
  const canvasEntities = dashboard.canvasEntities.slice(0, 5) as CanvasEntity[];

  return (
    <main
      className={
        isSidebarOpen
          ? "dashboard-shell canvas-shell is-sidebar-open"
          : "dashboard-shell canvas-shell"
      }
    >
      <button
        type="button"
        className="canvas-sidebar-toggle"
        aria-controls="canvas-sidebar"
        aria-expanded={isSidebarOpen}
        aria-label={isSidebarOpen ? "사이드바 닫기" : "사이드바 열기"}
        onClick={() => setIsSidebarOpen((current) => !current)}
      >
        {isSidebarOpen ? (
          <span className="canvas-sidebar-close" aria-hidden="true">
            x
          </span>
        ) : (
          <span className="canvas-sidebar-menu" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
      </button>

      <aside
        id="canvas-sidebar"
        className="sidebar"
        aria-label="PILO navigation"
      >
        <div className="brand">
          <CurrentWorkspaceSwitcher />
        </div>
        <nav className="nav-list" aria-label="Workspace navigation">
          {navItems.map((item) => {
            const className = item.active ? "nav-item active" : "nav-item";
            const content = (
              <>
                <span>{item.label}</span>
                {item.badge ? <b>{item.badge}</b> : null}
              </>
            );

            return item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className={className}
                aria-current={item.active ? "page" : undefined}
              >
                {content}
              </Link>
            ) : (
              <div key={item.label} className={className} aria-disabled="true">
                {content}
              </div>
            );
          })}
        </nav>
      </aside>

      <section
        className="workspace canvas-workspace"
        aria-label="Project canvas"
      >
        <header className="canvas-floating-bar canvas-floating-bar-left">
          <strong className="canvas-wordmark">PILO</strong>
          <button type="button" className="canvas-board-title">
            <span>개발 캔버스 보드</span>
            <small>{dashboard.workspace.name}</small>
          </button>
          <button type="button" className="canvas-bar-button">
            저장
          </button>
          <button type="button" className="canvas-bar-button">
            내보내기
          </button>
        </header>

        <header className="canvas-floating-bar canvas-floating-bar-right">
          <button type="button" className="canvas-status-pill">
            AI 제외
          </button>
          <LogoutButton />
          <CurrentUserAvatar />
          <button type="button" className="canvas-share-button">
            공유
          </button>
        </header>

        <nav className="canvas-tool-rail" aria-label="Canvas tools">
          <button type="button" aria-label="선택" className="is-active">
            ↖
          </button>
          <button type="button" aria-label="템플릿">
            ⧉
          </button>
          <button type="button" aria-label="프로젝트 카드">
            ▣
          </button>
          <button type="button" aria-label="스티키 메모">
            ◨
          </button>
          <button type="button" aria-label="텍스트">
            T
          </button>
          <button type="button" aria-label="연결선">
            ⟷
          </button>
          <button type="button" aria-label="파일">
            #
          </button>
          <button type="button" aria-label="더보기">
            +
          </button>
        </nav>

        <section className="canvas-content" aria-label="Canvas board preview">
          <section className="canvas-board" aria-label="Canvas node preview">
            <div className="canvas-grid" />
            <span className="canvas-connection-line line-one" />
            <span className="canvas-connection-line line-two" />
            <span className="canvas-connection-line line-three" />

            {canvasEntities.map((entity, index) => (
              <article
                className={`canvas-node canvas-node-${toneForEntity(entity)}`}
                key={`${entity.entityType}-${entity.entityId}`}
                style={canvasNodePositions[index]}
              >
                <span>{labelForEntity(entity)}</span>
                <strong>{entity.displayTitle}</strong>
                <small>{entity.entityType}</small>
              </article>
            ))}
          </section>
        </section>

        <div className="canvas-board-hud" aria-label="Canvas board status">
          <span>{dashboard.workspace.name}</span>
          <strong>fixture-board</strong>
          <em>{canvasEntities.length} nodes</em>
          <em>3 relations</em>
        </div>

        <div className="canvas-zoom-controls" aria-label="Canvas zoom controls">
          <button type="button" aria-label="화면 맞춤">
            ▣
          </button>
          <button type="button" aria-label="축소">
            -
          </button>
          <strong>100%</strong>
          <button type="button" aria-label="확대">
            +
          </button>
        </div>
      </section>
    </main>
  );
}
