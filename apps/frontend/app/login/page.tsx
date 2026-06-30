import { Suspense } from "react";
import { DraggableCanvasItems } from "./DraggableCanvasItems";
import { LoginAuthNotice } from "./LoginAuthNotice";
import {
  LoginProviderList,
  type LoginProviderEntry,
} from "./LoginProviderList";
import { WorkspaceEntryTransition } from "./WorkspaceEntryTransition";

const providerEntries: LoginProviderEntry[] = [
  {
    id: "google",
    name: "Google",
    eyebrow: "Google 이메일 계정으로 계속",
    path: "/api/auth/google/start",
    mark: "G",
    tone: "google",
  },
];

const backdropNavItems = [
  { label: "홈 / 대시보드", active: true },
  { label: "프로젝트 설정" },
  { label: "기능 목록" },
  { label: "태스크 보드", badge: "7" },
  { label: "회의 / 리포트" },
  { label: "음성 채팅" },
  { label: "캔버스" },
  { label: "GitHub PR", badge: "3" },
  { label: "코드 리뷰" },
  { label: "설정" },
];

function LoginProviderFallback() {
  return (
    <div className="provider-list" aria-hidden="true">
      {providerEntries.map((provider) => (
        <div className="provider-button" key={provider.name}>
          <span className={`provider-mark provider-${provider.tone}`}>
            {provider.mark}
          </span>
          <span>
            <strong>{provider.name}로 계속하기</strong>
            <small>{provider.eyebrow}</small>
          </span>
          <b aria-hidden="true">&rarr;</b>
        </div>
      ))}
    </div>
  );
}

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
              <span>AI 프로젝트 OS</span>
            </div>
          </div>
          <nav
            className="nav-list backdrop-nav-list"
            aria-label="대시보드 미리보기 내비게이션"
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
              <span>대시보드</span>
              <strong>PILO 팀</strong>
            </div>
            <b>회의 중 03:18</b>
          </header>

          <div className="backdrop-stats">
            <div>
              <span>진행 중 태스크</span>
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
                <span>태스크 보드</span>
              </div>
              <p>
                <i className="danger-dot" />
                로그인 API 연동<span>오늘</span>
              </p>
              <p>
                <i className="warning-dot" />
                캔버스 카드 정리<span>D-1</span>
              </p>
              <p>
                <i className="primary-dot" />
                PR #42 코드 리뷰<span>리뷰</span>
              </p>
            </section>

            <section className="backdrop-panel">
              <div className="backdrop-panel-head">
                <strong>에이전트 다음 제안</strong>
                <span>추천</span>
              </div>
              <p>
                <i className="primary-dot" />
                리뷰 대기 PR 먼저 확인<span>PR</span>
              </p>
              <p>
                <i className="warning-dot" />
                오늘 마감 태스크 범위 재확인<span>태스크</span>
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
            <span>AI 프로젝트 OS</span>
          </div>
        </div>

        <div className="login-card">
          <div className="login-card-head">
            <p className="eyebrow">로그인</p>
            <h1 id="login-title">PILO 로그인</h1>
            <p>워크스페이스로 계속하려면 Google 계정을 선택하세요.</p>
          </div>

          <Suspense fallback={null}>
            <LoginAuthNotice />
          </Suspense>

          <Suspense fallback={<LoginProviderFallback />}>
            <LoginProviderList providers={providerEntries} />
          </Suspense>

          <p className="login-boundary-note">
            GitHub 저장소 연결 권한은 로그인 이후 별도 단계에서 관리됩니다.
          </p>
        </div>

        <div className="login-meta-links">
          <span>이용약관</span>
          <span>개인정보 처리방침</span>
        </div>
      </section>
    </main>
  );
}
