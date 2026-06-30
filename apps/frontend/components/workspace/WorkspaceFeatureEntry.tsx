import Link from "next/link";
import { createWorkspaceDashboardFixture } from "../../lib/workspace/dashboardClient.mjs";
import {
  buildWorkspaceFeatureRoutes,
  buildWorkspaceFeatureTabs,
} from "../../lib/workspace/currentWorkspace.mjs";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export type WorkspaceFeatureSurface =
  | "tasks"
  | "github"
  | "meetings"
  | "reviews"
  | "agent"
  | "planning";

type WorkspaceFeatureEntryProps = {
  workspaceId: string;
  surface: WorkspaceFeatureSurface;
};

type FeatureCard = {
  title: string;
  meta: string;
  tone: "primary" | "success" | "warning" | "danger";
};

type FeatureDashboardFixture = {
  tasks: Array<{
    title: string;
    status: string;
    priority?: string;
    isDelayed?: boolean;
  }>;
  pullRequests: Array<{
    number: number;
    title: string;
    state: string;
    branch: string;
  }>;
  githubIssues: Array<{
    number: number;
    title: string;
    state: string;
    labels: string[];
  }>;
  meetingReports: Array<{
    title: string;
    decisionCount: number;
    actionItemCount: number;
    riskCount: number;
  }>;
  prAnalyses: Array<{
    purposeSummary: string;
    analysisStatus: string;
    riskLevel: string;
  }>;
  agentActions: Array<{
    type: string;
    status: string;
    source: string;
    requiresConfirmation?: boolean;
    payload?: {
      title?: string;
    };
  }>;
};

const surfaceConfig = {
  tasks: {
    eyebrow: "태스크",
    title: "태스크",
    navLabel: "태스크",
  },
  github: {
    eyebrow: "GITHUB",
    title: "GitHub",
    navLabel: "GitHub",
  },
  meetings: {
    eyebrow: "회의",
    title: "회의 / 음성 / 리포트",
    navLabel: "회의",
  },
  reviews: {
    eyebrow: "리뷰",
    title: "리뷰",
    navLabel: "리뷰",
  },
  agent: {
    eyebrow: "에이전트",
    title: "에이전트 / 프로젝트 설정",
    navLabel: "에이전트",
  },
  planning: {
    eyebrow: "프로젝트 설정",
    title: "프로젝트 설정",
    navLabel: "프로젝트 설정",
  },
} satisfies Record<
  WorkspaceFeatureSurface,
  { eyebrow: string; title: string; navLabel: string }
>;

function createRoutes(workspaceId: string) {
  return buildWorkspaceFeatureRoutes(workspaceId);
}

function createFeatureCards(
  surface: WorkspaceFeatureSurface,
  dashboard: FeatureDashboardFixture,
): FeatureCard[] {
  if (surface === "tasks") {
    return dashboard.tasks.map((task) => ({
      title: task.title,
      meta: `${task.status} / ${task.priority}`,
      tone: task.isDelayed ? "danger" : "primary",
    }));
  }

  if (surface === "github") {
    return [
      ...dashboard.pullRequests.map((pullRequest) => ({
        title: `#${pullRequest.number} ${pullRequest.title}`,
        meta: `${pullRequest.state} / ${pullRequest.branch}`,
        tone: "warning" as const,
      })),
      ...dashboard.githubIssues.map((issue) => ({
        title: `#${issue.number} ${issue.title}`,
        meta: `${issue.state} / ${issue.labels.join(", ")}`,
        tone: "primary" as const,
      })),
    ];
  }

  if (surface === "meetings") {
    return dashboard.meetingReports.map((report) => ({
      title: report.title,
      meta: `결정 ${report.decisionCount}개 / 액션 ${report.actionItemCount}개`,
      tone: report.riskCount ? "warning" : "success",
    }));
  }

  if (surface === "reviews") {
    return dashboard.prAnalyses.map((analysis) => ({
      title: analysis.purposeSummary,
      meta: `${analysis.analysisStatus} / ${analysis.riskLevel} 리스크`,
      tone: analysis.riskLevel === "high" ? "danger" : "warning",
    }));
  }

  return dashboard.agentActions.map((action) => ({
    title: action.payload?.title ?? action.type,
    meta: `${action.status} / ${action.source}`,
    tone: action.requiresConfirmation ? "primary" : "success",
  }));
}

export function WorkspaceFeatureEntry({
  workspaceId,
  surface,
}: WorkspaceFeatureEntryProps) {
  const dashboard = createWorkspaceDashboardFixture(
    workspaceId,
  ) as FeatureDashboardFixture;
  const config = surfaceConfig[surface];
  const routes = createRoutes(workspaceId);
  const featureCards = createFeatureCards(surface, dashboard);
  const navItems = buildWorkspaceFeatureTabs(workspaceId, {
    active: surface,
    badges: {
      tasks: dashboard.tasks.length,
      github: dashboard.pullRequests.length + dashboard.githubIssues.length,
      meetings: dashboard.meetingReports.length || undefined,
      reviews: dashboard.prAnalyses.length || undefined,
      agent: dashboard.agentActions.length || undefined,
    },
  });

  return (
    <main className="dashboard-shell feature-entry-shell">
      <WorkspaceSidebar
        items={navItems}
        ariaLabel="워크스페이스 기능 내비게이션"
        navAriaLabel="워크스페이스 기능 화면"
      />

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{config.eyebrow}</p>
            <h1>{config.title}</h1>
          </div>
          <div className="topbar-actions">
            <Link className="meeting-chip" href={routes.dashboard}>
              대시보드
            </Link>
            <Link className="meeting-chip" href={routes.canvas}>
              캔버스
            </Link>
          </div>
        </header>

        <section
          className="dashboard-content feature-entry-content"
          aria-label={`${config.navLabel} 워크스페이스 화면`}
        >
          <div className="feature-entry-grid">
            {featureCards.length ? (
              featureCards.map((card) => (
                <article className="feature-entry-card" key={card.title}>
                  <span className={`status-dot tone-${card.tone}`} />
                  <strong>{card.title}</strong>
                  <small>{card.meta}</small>
                </article>
              ))
            ) : (
              <p className="canvas-board-empty">아직 표시할 fixture 항목이 없습니다.</p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
