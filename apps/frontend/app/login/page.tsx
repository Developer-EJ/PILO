import { Suspense } from "react";
import { DraggableCanvasItems } from "./DraggableCanvasItems";
import { WorkspaceEntryTransition } from "./WorkspaceEntryTransition";
import { authProviderHref } from "./authProviderHref.mjs";

const providers = [
  {
    name: "Google",
    eyebrow: "Workspace 계정으로 계속",
    href: authProviderHref("/auth/google/start"),
    mark: "G",
    tone: "google",
  },
  {
    name: "GitHub",
    eyebrow: "개발자 계정으로 계속",
    href: authProviderHref("/auth/github/start"),
    mark: "GH",
    tone: "github",
  },
];

const backdropNavItems = [
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

export default function LoginPage() {
  return (
    <main className="login-canvas-shell">
      <Suspense fallback={null}>
        <WorkspaceEntryTransition />
      </Suspense>

      <section className="login-workspace-backdrop" aria-hidden="true">
        <aside className="backdrop-sidebar">
          <div className="backdrop-brand">
            <div className="brand-mark">P</div>
            <div>
              <p>PILO</p>
              <span>AI Project OS</span>
            </div>
          </div>
          <nav
            className="nav-list backdrop-nav-list"
            aria-label="Dashboard navigation preview"
          >
            {backdropNavItems.map((item) => (
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

        <section>
          <header className="backdrop-topbar">
            <div>
              <span>DASHBOARD</span>
              <strong>PILO Team</strong>
            </div>
            <b>회의 중 03:18</b>
          </header>

          <div className="backdrop-stats">
            <div>
              <span>진행 중 Task</span>
              <strong>3</strong>
            </div>
            <div>
              <span>리뷰 대기 PR</span>
              <strong>3</strong>
            </div>
            <div>
              <span>이번 주 마감</span>
              <strong>5</strong>
            </div>
            <div>
              <span>막힌 작업</span>
              <strong>1</strong>
            </div>
          </div>

          <div className="backdrop-content">
            <section className="backdrop-panel">
              <div className="backdrop-panel-head">
                <strong>오늘 해야 할 일</strong>
                <span>Task 보드</span>
              </div>
              <p>
                <i className="danger-dot" />
                로그인 API 연동<span>오늘</span>
              </p>
              <p>
                <i className="warning-dot" />
                Canvas card shape<span>D-1</span>
              </p>
              <p>
                <i className="primary-dot" />
                PR #42 코드리뷰<span>리뷰</span>
              </p>
            </section>

            <section className="backdrop-panel">
              <div className="backdrop-panel-head">
                <strong>Agent 다음 제안</strong>
                <span>추천</span>
              </div>
              <p>
                <i className="primary-dot" />
                리뷰 대기 PR 먼저 확인<span>PR</span>
              </p>
              <p>
                <i className="warning-dot" />
                오늘 마감 Task 범위 점검<span>Task</span>
              </p>
            </section>
          </div>
        </section>
      </section>

      <DraggableCanvasItems />

      <section className="login-center" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="brand-mark">P</div>
          <div>
            <p>PILO</p>
            <span>AI Project OS</span>
          </div>
        </div>

        <div className="login-card">
          <div className="login-card-head">
            <p className="eyebrow">SIGN IN</p>
            <h1 id="login-title">PILO에 로그인</h1>
            <p>Workspace로 계속하려면 계정을 선택하세요.</p>
          </div>

          <div className="provider-list">
            {providers.map((provider) => (
              <a
                className="provider-button"
                href={provider.href}
                key={provider.name}
              >
                <span className={`provider-mark provider-${provider.tone}`}>
                  {provider.mark}
                </span>
                <span>
                  <strong>{provider.name}로 계속하기</strong>
                  <small>{provider.eyebrow}</small>
                </span>
                <b aria-hidden="true">→</b>
              </a>
            ))}
          </div>

          <p className="login-boundary-note">
            GitHub 로그인은 인증용이며 Repository 연결 권한은 별도 단계에서
            관리됩니다.
          </p>
        </div>

        <div className="login-meta-links">
          <span>Terms</span>
          <span>Privacy</span>
        </div>
      </section>
    </main>
  );
}
