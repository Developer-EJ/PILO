import { Suspense } from "react";
import { AuthGuard } from "../components/auth/AuthGuard";
import { CurrentUserAvatar } from "../components/auth/CurrentUserAvatar";
import { LogoutButton } from "../components/auth/LogoutButton";
import { CurrentWorkspaceSwitcher } from "../components/workspace/CurrentWorkspaceSwitcher";

const stats = [
  { label: "진행 중 Task", value: "3", icon: "⚡", tone: "primary" },
  { label: "리뷰 대기 PR", value: "3", icon: "◆", tone: "warning" },
  { label: "이번 주 마감", value: "5", icon: "●", tone: "success" },
  { label: "막힌 작업", value: "1", icon: "■", tone: "danger" },
];

const navItems = [
  { label: "홈 / 대시보드", active: true },
  { label: "프로젝트 시작" },
  { label: "기능 목록" },
  { label: "Task 보드", badge: "7" },
  { label: "회의 / Report" },
  { label: "음성채팅" },
  { label: "Canvas" },
  { label: "GitHub PR", badge: "3" },
  { label: "Code Review" },
  { label: "설정" },
];

const todayTasks = [
  { title: "로그인 API 연동", tag: "백엔드", due: "오늘", tone: "danger" },
  { title: "책 검색 UI 구현", tag: "프론트", due: "D-1", tone: "warning" },
  { title: "PR #42 코드리뷰", tag: "리뷰", due: "오늘", tone: "primary" },
];

const reviewPrs = [
  {
    num: 42,
    title: "Fix: 로그인 인증 흐름",
    author: "은지",
    status: "리뷰 요청",
    tone: "warning",
  },
  {
    num: 39,
    title: "Feat: Task 보드 DnD",
    author: "준호",
    status: "Open",
    tone: "success",
  },
];

const agentSuggestions = [
  {
    text: "PR #42가 6시간째 리뷰 대기 중이에요. Code Review Room에서 확인할 준비가 필요합니다.",
    cta: "리뷰 우선순위",
  },
  {
    text: "‘책 검색 UI’가 내일 마감인데 아직 In Progress예요. 담당자와 범위를 다시 확인하세요.",
    cta: "Task 리스크",
  },
];

const decisions = [
  "검색은 제목 + 저자 기준으로 우선 구현하기로 결정",
  "JWT 토큰 만료 30분 + 리프레시 토큰 적용",
  "배포는 프론트 CloudFront · 백엔드 ECS 기준으로 정리",
];

export default function Home() {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <main className="dashboard-shell">
          <aside className="sidebar" aria-label="PILO navigation preview">
            <div className="brand">
              <CurrentWorkspaceSwitcher />
            </div>
            <nav className="nav-list" aria-label="Dashboard only navigation">
              {navItems.map((item) => (
                <div
                  key={item.label}
                  className={item.active ? "nav-item active" : "nav-item"}
                  aria-disabled={!item.active}
                >
                  <span>{item.label}</span>
                  {item.badge ? <b>{item.badge}</b> : null}
                </div>
              ))}
            </nav>
          </aside>

          <section className="workspace">
            <header className="topbar">
              <div>
                <p className="eyebrow">DASHBOARD</p>
                <h1>홈 / 대시보드</h1>
              </div>
              <div className="topbar-actions">
                <div className="meeting-chip">
                  <span className="live-dot" />
                  회의 중<code>03:18</code>
                </div>
                <LogoutButton />
                <CurrentUserAvatar />
              </div>
            </header>

            <section
              className="dashboard-content"
              aria-label="PILO dashboard layout"
            >
              <div className="stats-grid">
                {stats.map((stat) => (
                  <article className="stat-card" key={stat.label}>
                    <div>
                      <span>{stat.label}</span>
                      <i className={`tone-${stat.tone}`}>{stat.icon}</i>
                    </div>
                    <strong>{stat.value}</strong>
                  </article>
                ))}
              </div>

              <div className="content-grid">
                <div className="left-column">
                  <section className="panel">
                    <div className="panel-head">
                      <h2>오늘 해야 할 일</h2>
                      <span>Task 보드</span>
                    </div>
                    <div className="list">
                      {todayTasks.map((task) => (
                        <div className="task-row" key={task.title}>
                          <i className={`status-dot tone-${task.tone}`} />
                          <strong>{task.title}</strong>
                          <span className="tag">{task.tag}</span>
                          <b className={`due tone-${task.tone}`}>{task.due}</b>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="panel-head">
                      <h2>리뷰 대기 PR</h2>
                      <span>전체 PR</span>
                    </div>
                    <div className="list">
                      {reviewPrs.map((pr) => (
                        <div className="pr-row" key={pr.num}>
                          <div className="pr-icon">◇</div>
                          <div>
                            <strong>{pr.title}</strong>
                            <small>
                              #{pr.num} · {pr.author}
                            </small>
                          </div>
                          <b className={`pill tone-${pr.tone}`}>{pr.status}</b>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <div className="right-column">
                  <section className="agent-panel">
                    <div className="agent-title">
                      <span>✦</span>
                      <h2>Agent 다음 제안</h2>
                    </div>
                    {agentSuggestions.map((item) => (
                      <article className="agent-card" key={item.cta}>
                        <p>{item.text}</p>
                        <span>{item.cta}</span>
                      </article>
                    ))}
                  </section>

                  <section className="panel decision-panel">
                    <div className="panel-head">
                      <h2>최근 회의 결정</h2>
                      <span>회의록</span>
                    </div>
                    <div className="decision-list">
                      {decisions.map((decision) => (
                        <p key={decision}>
                          <span>✓</span>
                          {decision}
                        </p>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </section>
          </section>
        </main>
      </AuthGuard>
    </Suspense>
  );
}
