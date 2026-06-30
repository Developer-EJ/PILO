# PILO 기능 명세서 초안

## 4. MVP 기능 범위

## 4.1 포함 기능

| 구분 | 기능 | 우선순위 |
| --- | --- | --- |
| 계정/팀 | 회원가입, 로그인, Workspace 생성, 팀원 초대 | Must |
| AI Agent | 프로젝트 시작 가이드, 기술스택 추천, 기능 분해, Task 추천 | Must |
| Task 관리 | Task 생성, 수정, 삭제, 상태 변경, 담당자 지정, 마감일 설정 | Must |
| GitHub 연동 | GitHub 계정 연동, Repository 연결, Issue 생성/동기화, PR 불러오기 | Must |
| 회의 Report | 회의 내용 기반 Report 생성, 결정사항/후속 작업 분리, Task 전환 | Must |
| Canvas | 기본 Canvas, 메모, Task, Report, Issue, PR 노드 배치 및 연결 | Should |
| Code Review Room | PR 요약, 변경 파일 노드 그래프, diff 확인, 리뷰 판단, Merge 체크리스트 | Must |
| 채팅 | 팀 채팅(MVP단계에서는 제외), @Agent 호출 | Should |
| 알림 | 담당 Task 변경, 마감 임박, 리뷰 요청, Report 생성, PR 상태 변경 | Should |

## 4.2 MVP 제외 기능

| 제외 기능 | 제외 이유 |
| --- | --- |
| 고도화된 음성 회의 transcript | 초기에는 텍스트 기반 회의 기록으로 검증 가능 |
| 서비스 내 직접 Merge | GitHub 권한 및 안정성 문제로 후순위 |
| 복잡한 권한 관리 | 초기 초보 팀 단위에서는 Owner/Member 정도로 충분 |
| VS Code Extension | 핵심 검증 이후 확장 기능 |
| 완전 자동 Canvas 조작 | MVP에서는 Agent 제안 및 기본 노드 생성 중심 |
| 고급 테스트 자동화 | 초기 핵심은 코드 실행보다 PR 이해와 리뷰 학습 |
| 별도 강의형 튜토리얼 | Agent의 기본 UX가 튜토리얼 역할을 수행 |
| 공유 드라이브 | 파일 업로드 및 Canvas/Report 연결 |

---

# 5. 기능 상세 명세

---

## 5.1 회원 / 인증

### 기능 목적

사용자가 OAuth 로그인을 통해 PILO에 접근하고, 자신의 계정과 세션을 기반으로 Workspace, Dashboard, Canvas 등 보호된 프로젝트 화면에 접근할 수 있게 한다.

### 인증 방식

PILO의 MVP 인증은 OAuth 기반 로그인을 사용한다.

MVP에서 지원하는 OAuth Provider는 다음과 같다.

| Provider | 목적 | 우선순위 |
| --- | --- | --- |
| Google | 기본 소셜 로그인 | Must |
| GitHub | 개발자 친화 로그인 | Must |

이메일 / 비밀번호 회원가입은 MVP 범위에서 제외한다.

GitHub 로그인은 GitHub Repository 연동 권한과 분리한다.

즉, GitHub로 로그인했다고 해서 Repository 접근 권한을 자동으로 가진 것으로 처리하지 않는다.

### 주요 기능

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| OAuth 로그인 시작 | Google / GitHub 로그인 URL로 사용자를 이동시킨다. | Must |
| OAuth Callback 처리 | Provider가 돌려준 code와 state를 검증하고 로그인 처리를 완료한다. | Must |
| OAuth state 검증 | CSRF와 잘못된 callback 접근을 막기 위해 state를 저장하고 검증한다. | Must |
| 사용자 생성 / 조회 | 최초 OAuth 로그인 시 User를 생성하고, 기존 계정이면 재사용한다. | Must |
| 소셜 계정 중복 방지 | provider + providerUserId 기준으로 중복 가입을 방지한다. | Must |
| 세션 쿠키 발급 | 로그인 성공 시 서버 세션을 만들고 브라우저에 세션 쿠키를 발급한다. | Must |
| 현재 사용자 조회 | `/auth/me`로 현재 로그인 사용자를 조회한다. | Must |
| 로그아웃 | 현재 세션을 revoke하고 쿠키를 만료시킨다. | Must |
| 보호 라우트 처리 | 로그인하지 않은 사용자가 보호 화면에 접근하면 로그인 화면으로 보낸다. | Must |
| 로그인 후 복귀 | 로그인 전 접근하려던 `next` 경로로 안전하게 복귀한다. | Must |
| 프로필 수정 | 이름, 프로필 이미지 수정 | MVP 제외 |

### 세션 정책

- 로그인 성공 시 서버는 `AuthSession`을 생성한다.
- 브라우저에는 세션 쿠키를 발급한다.
- 세션 쿠키는 `HttpOnly`를 사용한다.
- 운영 환경에서는 `Secure` 쿠키를 사용한다.
- 로그아웃 시 서버 세션을 revoke하고 쿠키를 만료시킨다.
- 세션이 없거나 만료된 사용자는 보호된 API와 화면에 접근할 수 없다.

### 로그인 흐름

1. 사용자가 로그인 화면에서 Google 또는 GitHub를 선택한다.
2. 서버가 OAuth authorization URL을 생성한다.
3. 서버는 OAuth `state`를 저장한다.
4. 사용자는 Provider 로그인 화면으로 이동한다.
5. Provider가 callback URL로 `code`와 `state`를 전달한다.
6. 서버는 `state`를 검증한다.
7. 서버는 Provider에서 access token과 profile을 가져온다.
8. 서버는 User와 OAuthAccount를 생성하거나 기존 계정을 조회한다.
9. 서버는 AuthSession을 생성하고 세션 쿠키를 발급한다.
10. 사용자는 원래 접근하려던 `next` 경로 또는 기본 Workspace 화면으로 이동한다.

### 보호 라우트 정책

- `/login`, `/login/callback`은 비로그인 상태에서도 접근 가능하다.
- Workspace, Dashboard, Canvas 등 프로젝트 화면은 로그인한 사용자만 접근할 수 있다.
- 비로그인 사용자가 보호 화면에 접근하면 `/login?next=원래경로`로 이동한다.
- `next` 값은 내부 경로만 허용한다.
- 외부 URL, `//evil.example` 같은 값은 기본 경로로 대체한다.

### 현재 사용자 조회

`/auth/me`는 현재 세션 기준 사용자 정보를 반환한다.

반환 정보는 다음을 포함한다.

| 필드 | 설명 |
| --- | --- |
| id | 사용자 ID |
| email | 이메일 |
| name | 사용자 이름 |
| avatarUrl | 프로필 이미지 |
| providers | 연결된 OAuth Provider 목록 |
| lastLoginAt | 마지막 로그인 시각 |

`내 정보 조회`는 MVP 제외가 아니라 **Must**로 두는 게 맞다.

이게 있어야 AuthGuard, Header, Workspace 진입, Logout UI가 정상 동작한다.

### 기본 정책

- 한 사용자는 여러 Workspace에 참여할 수 있다.
- 사용자는 Workspace마다 다른 역할을 가질 수 있다.
- 인증은 사용자 식별까지만 담당한다.
- Workspace 접근 권한은 `WorkspaceMember` 기준으로 판단한다.
- GitHub 로그인과 GitHub Repository 연결 권한은 분리한다.
- MVP에서는 이메일 / 비밀번호 로그인, 비밀번호 재설정, 이메일 인증은 제외한다.

### 수용 조건

- 사용자는 Google OAuth로 로그인할 수 있어야 한다.
- 사용자는 GitHub OAuth로 로그인할 수 있어야 한다.
- OAuth callback의 state가 잘못되면 로그인이 실패해야 한다.
- 최초 OAuth 로그인 시 User와 OAuthAccount가 생성되어야 한다.
- 같은 Provider 계정으로 다시 로그인하면 중복 User가 생성되지 않아야 한다.
(깃허브 로그인한 김은재와 지메일 로그인한 김은재는 같은사람이어야 함. MVP 제외)
- 로그인 성공 시 세션 쿠키가 발급되어야 한다.
- `/auth/me`는 로그인한 사용자의 정보를 반환해야 한다.
- `/auth/me`는 세션이 없으면 401을 반환해야 한다.
- 로그아웃하면 현재 세션이 무효화되어야 한다.
- 로그아웃 후 같은 세션 쿠키로 `/auth/me`를 호출하면 401이 반환되어야 한다.
- 비로그인 사용자는 Workspace, Dashboard, Canvas에 접근할 수 없어야 한다.
- 로그인 후 사용자는 원래 접근하려던 내부 경로로 돌아갈 수 있어야 한다.

---

## 5.2 Workspace 관리

### 기능 목적

팀 프로젝트를 운영할 독립적인 공간을 생성하고, 팀원을 초대하며, 사용자별 Workspace 접근 권한과 현재 선택된 Workspace를 관리한다.

Workspace는 PILO의 모든 프로젝트 데이터가 묶이는 최상위 단위이다.

Task, 회의, Report, GitHub 연동, PR 리뷰, Canvas, Dashboard 데이터는 반드시 하나의 Workspace에 소속된다.

### 주요 기능

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| Workspace 생성 | 로그인한 사용자가 프로젝트 공간을 생성한다. 생성자는 자동으로 Owner가 된다. | Must |
| Workspace 목록 조회 | 내가 속한 Workspace 목록을 조회한다. | Must |
| Workspace 상세 조회 | Workspace 이름, 설명, 타입, 상태, 내 역할, 멤버 수를 조회한다. | MVP 제외 |
| 현재 Workspace 선택 | URL 또는 저장된 상태를 기준으로 현재 작업할 Workspace를 선택한다. | Must |
| Workspace 수정 | Owner가 Workspace 이름, 설명, 타입, 상태를 수정한다. | MVP 제외 |
| Workspace 보관 / 삭제 | Owner가 Workspace를 삭제하거나 보관 처리한다. MVP에서는 soft delete 또는 archive를 우선한다. | MVP 제외 |
| 팀원 초대 생성 | Owner가 이메일 또는 초대 링크 기반으로 팀원을 초대한다. (이메일로 초대는 MVP에서 제외) | Must |
| 초대 수락 | 초대받은 사용자가 token을 통해 Workspace에 참여한다. | Must |
| 팀원 목록 조회 | Workspace 참여자 목록과 역할을 조회한다. | Must |
| 팀원 역할 관리 | Owner가 멤버 역할을 변경한다. | MVP 제외 |
| Dashboard 설정 저장 | 사용자별 Dashboard layout, hidden section 설정을 저장한다. | MVP 제외 |

### Workspace 생성 정책

- Workspace는 로그인한 사용자만 생성할 수 있다.
- Workspace를 생성한 사용자는 자동으로 `Owner` 역할의 멤버가 된다.
- Workspace 생성 시 최소 입력값은 `name`이다.
- 선택 입력값으로 `description`, `type`을 받을 수 있다.
- 생성된 Workspace는 기본 상태가 `active`이다.

### Workspace 필드

| 필드 | 설명 |
| --- | --- |
| id | Workspace ID |
| name | Workspace 이름 |
| description | Workspace 설명 |
| type | 프로젝트 유형. 예: side_project, bootcamp, university, hackathon, other |
| status | active 또는 archived |
| myRole | 현재 사용자의 Workspace 역할 |
| memberCount | 참여 멤버 수 |
| createdAt | 생성 시각 |
| updatedAt | 수정 시각 |

### 초대 정책

- 팀원 초대는 Owner만 생성할 수 있다.
- 초대는 이메일과 역할을 포함한다.
- 초대에는 token이 발급된다.
- 초대 token은 만료 시간이 있어야 한다.
- 초대받은 사용자는 로그인 후 token을 통해 초대를 수락한다.
- 이미 수락된 초대, 만료된 초대, 취소된 초대는 다시 사용할 수 없다.
- 이미 Workspace 멤버인 사용자가 같은 초대를 수락해도 중복 멤버가 생성되면 안 된다.

### 권한

| 역할 | 권한 |
| --- | --- |
| Owner | Workspace 조회, 수정, 보관/삭제, 팀원 초대, GitHub 연동, 멤버 관리 가능 |
| Member | Workspace 조회, Task, 회의, Canvas, PR 리뷰 사용 가능 |
| Viewer | Workspace와 일부 데이터를 읽을 수 있으나 수정은 불가(MVP 제외) |

### 현재 Workspace 선택 정책

- 사용자가 `/workspaces/:workspaceId` 경로에 접근하면 URL의 Workspace ID를 우선한다.
- URL에 Workspace ID가 없으면 최근 선택한 Workspace를 사용한다.
- 최근 선택한 Workspace도 없으면 내가 속한 Workspace 중 기본 Workspace를 사용한다.
- URL의 Workspace ID가 존재하지 않거나 접근 권한이 없으면 다른 Workspace로 조용히 대체하지 않는다.
- 사용자는 자신이 속하지 않은 Workspace에 접근할 수 없어야 한다.

### Dashboard 설정 정책 (MVP 제외)

Workspace Dashboard는 사용자별 설정을 가질 수 있다.

| 설정 | 설명 |
| --- | --- |
| layout | Dashboard 카드 배치 |
| hiddenSections | 숨긴 Dashboard 섹션 목록 |

Dashboard 설정은 Workspace 전체 설정이 아니라 `workspaceId + memberId` 기준으로 저장한다.

### 수용 조건

- 로그인한 사용자는 Workspace를 생성할 수 있어야 한다.
- Workspace 생성자는 자동으로 Owner가 되어야 한다.
- 사용자는 자신이 속한 Workspace 목록을 조회할 수 있어야 한다.
- 사용자는 자신이 속한 Workspace 상세 정보를 조회할 수 있어야 한다.
- 사용자는 자신이 속하지 않은 Workspace를 조회할 수 없어야 한다.
- Owner는 Workspace 이름, 설명, 타입, 상태를 수정할 수 있어야 한다.
- Member는 Workspace 설정을 수정할 수 없어야 한다.
- Owner는 팀원 초대를 생성할 수 있어야 한다.
- 초대받은 사용자는 유효한 token으로 Workspace에 참여할 수 있어야 한다.
- 만료되었거나 취소되었거나 이미 수락된 초대는 사용할 수 없어야 한다.
- 사용자는 Workspace 참여자 목록을 조회할 수 있어야 한다.
- Workspace 내부 데이터는 해당 Workspace 멤버만 접근할 수 있어야 한다.
- Workspace 삭제는 MVP에서 실제 영구 삭제보다 archive 또는 soft delete로 처리하는 것을 우선한다.(MVP 제외)

---

## 5.3 AI Agent

### 기능 목적

AI Agent는 프로젝트 운영 경험이 부족한 팀을 위해 프로젝트 시작부터 기획, 역할 분담, 일정 관리, 회의 정리, GitHub Issue 연결, PR 리뷰, 진행 점검까지 단계별로 안내하는 프로젝트 운영 코치이자 보조 PM 역할을 수행한다.

Agent는 단순히 질문에 답변하는 챗봇이 아니라, Workspace 내부의 Task, 회의 Report, Canvas, GitHub Issue, PR, 채팅 맥락을 함께 참고하여 사용자가 지금 해야 할 일을 제안하고, 필요한 경우 실제 기능 실행까지 연결한다.

단, Task 생성, GitHub Issue 생성, Report 확정, Canvas 변경, 알림 발송처럼 Workspace 데이터가 변경되는 작업은 사용자의 승인 후 실행한다.

---

### Agent 구성

| 구분 | Agent 기능 | 설명 | 우선순위 |
| --- | --- | --- | --- |
| Agent Core | 총괄 Agent | 사용자의 요청 의도를 분류하고 적절한 하위 Agent 또는 기능 API를 선택한다. | Must |
| Agent Core | 화면 맥락 주입 | 현재 화면, 선택된 Task/PR/Canvas/회의 세션 정보를 Agent 요청에 포함한다. | Must |
| Agent Core | 실행 확인 정책 | 실제 데이터 변경 또는 외부 API 호출 전 사용자 승인 필요 여부를 판단한다. | Must |
| Agent Core | 프로젝트 맥락 저장/검색 | 회의, Task, Issue, PR, Canvas 이벤트를 저장하고 Agent 응답의 근거로 검색한다. | Must |
| Agent Core | Agent 실행 로그 | Agent가 어떤 맥락을 참고해 어떤 제안을 했고 사용자가 어떻게 처리했는지 기록한다. | Must |
| 프로젝트 시작 | 프로젝트 시작 가이드 | 프로젝트 아이디어, 기간, 팀원 수, 산출물 목표, 팀원 경험을 바탕으로 초기 방향을 잡는다. | Must |
| 프로젝트 시작 | 기술스택 추천 | 팀 수준, 기간, 기능 요구, 배포 필요 여부를 고려해 기술스택 후보를 추천한다. | Must |
| 프로젝트 시작 | 기술스택 적합성 점검 | 사용자가 입력한 기술스택이 기능 요구와 팀 역량에 적합한지 점검한다. | Must |
| 기획/일정 | MVP 기능 분해 | 서비스 목표를 MVP, 후순위 기능, 제외 기능으로 분류한다. | Must |
| 기획/일정 | 역할 분담 추천 | 팀원 경험, 희망 역할, 가용 시간을 바탕으로 역할 분담 후보를 제안한다. | Must |
| 기획/일정 | 마일스톤 생성 | 프로젝트 기간에 맞춰 기획, 설계, 개발, 리뷰, 발표 일정을 나눈다. | Must |
| 기획/일정 | Task 분해 | 기능을 하루 안에 처리 가능하고 완료 조건이 명확한 작업 단위로 분해한다. | Must |
| 기획/일정 | 중복 Task 탐지 | 새 Task 후보가 기존 Task 또는 GitHub Issue와 중복되는지 점검한다. | Must |
| GitHub 연동 | GitHub Issue 생성 보조 | 확정된 Task를 GitHub Issue 형식으로 변환하고 생성 전 미리보기를 제공한다. | MVP 제외 |
| GitHub 연동 | GitHub 동기화 | GitHub Issue/PR 상태 변경을 서비스 Task 및 PR 상태와 동기화한다. | Must |
| 회의 | 회의 세션 관리 | 일반 음성채팅과 Report 생성을 위한 회의 세션을 구분하고 기록 범위를 관리한다. | Must |
|  |  |  |  |
| 회의 | 회의 Report 생성 | 회의 중 채팅, Canvas 작업, 메모, 투표, Task 변경을 바탕으로 Report 초안을 생성한다. | Must |
| 회의 | 회의 결정 → Task 변환 | 회의 후속 작업을 담당자와 완료 조건이 있는 Task 후보로 변환한다. | Must |
| PR 리뷰 | PR 전체 요약 | PR의 목적, 변경 범위, 먼저 확인해야 할 파일을 초보자용 문장으로 설명한다. | Must |
| PR 리뷰 | PR 그래프 분석 | 변경 파일기반으로 관계를 플로우차트로 시각화한다. | Must |
| PR 리뷰 | 노드 상세 분석 | 선택한 노드의 역할, 수정 이유, 실제 diff, 함께 확인할 파일을 설명한다. | Must |
| PR 리뷰 | 리뷰 질문 생성 | 초보 리뷰어가 확인해야 할 질문과 확인 방법을 구체적으로 제안한다. | Must |
| PR 리뷰 | 리뷰 주의 지점 탐지 | 인증, 권한, 상태, 데이터 처리 등 영향 범위가 큰 변경을 감지한다. | MVP 제외 |
| PR 리뷰 | Merge 전 체크리스트 | 리뷰 결과, 위험 지점, 판단되지 않은 노드를 바탕으로 Merge 전 확인 목록을 생성한다. | MVP 제외 |
| PR 리뷰 | PR 리뷰 결과 저장 | 노드별 문제 없음, 논의 필요, 판단 불가 상태와 코멘트를 저장한다. | MVP 제외 |
| Canvas | 캔버스 정리 | Report, Task, PR, 결정사항을 기준으로 관련 컴포넌트 배치 초안을 제안한다. | Should |
| Chat | 채팅 내용 Task화 | 선택된 채팅 메시지를 Task 후보로 변환하고 원문 링크를 연결한다. | Should |
| 알림 | 알림 생성 | Task, PR, Report 이벤트를 사용자별 관련도와 긴급도에 따라 대시보드내의 컴포넌트로 알림생성 | Must |
| 진행 관리 | 작업 트래킹 | 지연, 막힘, 리뷰 필요, 담당자 누락, 마일스톤 위험을 감지하고 다음 행동을 제안한다. | Must |
| 진행 관리 | 주간 리포트 | 한 주의 완료 작업, 지연 작업, 위험 요소, 다음 주 계획을 요약한다. | MVP 제외 |
| 진행 관리 | 프로젝트 회고 | 프로젝트 종료 후 잘된 점, 아쉬운 점, 반복된 병목, 개선점을 정리한다. | MVP 제외 |
| 호출 방식 | 채팅 Agent 호출 | 채팅창에서 @Agent 또는 Agent 입력창으로 요청을 전달한다. | Must |
| 호출 방식 | 마이크 버튼 호출 | 사용자의 음성 발화를 텍스트로 변환하고 Agent 요청으로 전달한다. | Must |
| 호출 방식 | 음성채팅 호출어 호출 | 음성채팅 중 호출어 이후 발화를 Agent 요청으로 처리한다. | Must |
| 호출 방식 | 회의 중 음성 조작 | 회의 중 음성 요청을 결정사항, Task 후보, Report 항목으로 반영한다. | Must |
| 호출 방식 | 호출 상태 표시 | 듣는 중, 처리 중, 완료, 실패, 확인 대기 상태를 UI에 표시한다. | Must |
| 예외 처리 | 오류/실패 처리 | STT 실패, GitHub 권한 실패, 동기화 충돌, Agent 응답 실패 시 대안을 안내한다. | Must |
| 개인화 | 팀원 프로필 관리 | 팀원별 기술 경험, 희망 역할, 가용 시간, GitHub 계정을 구조화한다. | MVP 제외 |
| 개인화 | 제안 피드백 반영 | 사용자의 수락, 거절, 수정 이력을 이후 Agent 추천에 반영한다. | MVP 제외 |

---

### Agent 입력 데이터

Agent는 요청 처리 시 사용자의 직접 입력뿐 아니라 Workspace 내부의 프로젝트 맥락을 함께 사용한다.

| 입력 범주 | 세부 데이터 |
| --- | --- |
| 사용자 요청 | 채팅 메시지, 음성 발화 텍스트, 버튼 클릭, 선택한 객체 |
| 호출 맥락 | 호출 방식, 현재 화면, 현재 채널, 선택된 Task/Issue/PR/Canvas 노드/회의 세션 |
| 프로젝트 정보 | 프로젝트 목표, 기간, 팀원 수, 산출물 목표, 기술스택, 마일스톤 |
| 팀원 정보 | 팀원별 기술 경험, 희망 역할, 가용 시간, GitHub 계정, 담당 가능 영역 |
| Task 정보 | Task 제목, 설명, 담당자, 마감일, 상태, Blocked 여부, 완료 조건 |
| GitHub 정보 | Repository, Issue 목록, PR 목록, PR diff, 파일 경로, 함수명, 라벨, PR 상태 |
| 회의 정보 | MeetingSession, 회의 Agenda, 회의 메모, 채팅, 투표 결과, Action Item, Report |
| Canvas 정보 | Canvas 노드, 연결선, 메모, 문서, 코드, Report 컴포넌트, Task 컴포넌트 |
| Agent 이력 | Agent 제안, 사용자의 승인/거절/수정 이력, 실행 결과, 실패 로그 |
| 권한 정보 | 사용자의 Workspace 권한, GitHub 권한, 접근 가능한 자료 범위 |

---

### Agent 출력 데이터

Agent는 단순 자연어 답변이 아니라, 사용자가 바로 확인하고 실행할 수 있는 구조화된 결과를 함께 제공한다.

| 출력 범주 | 세부 데이터 |
| --- | --- |
| 자연어 응답 | 질문 답변, 설명, 안내 문구, 실패 사유 |
| 프로젝트 산출물 | ProjectBrief, TechStackDecision, FeatureList, RoleAssignment, Milestone |
| 작업 산출물 | TaskCandidate, 완료 조건, 담당자 추천, 마감일 추천, 중복 Task 후보 |
| GitHub 산출물 | GitHub Issue 생성 미리보기, PRSummary, ReviewGraph, Checklist |
| 회의 산출물 | Agenda, ReportDraft, ActionItem, 회의 결정사항, 보류사항 |
| PR 리뷰 산출물 | NodeAnalysis, ReviewQuestion, RiskFlag, ReviewDecision, PRReviewSummary |
| Canvas 산출물 | Canvas layout suggestion, 정리 전/후 미리보기 |
| 알림 산출물 | Notification, 리스크 카드, 다음 행동 제안 |
| 실행 관련 산출물 | ExecutionApprovalRequest, 실행 확인 카드, 실행 결과, 오류 복구 카드 |
| 기록 산출물 | ProjectContext, AgentRunLog, FeedbackEvent |

---

### Agent 실행 흐름

1. 사용자가 채팅, 마이크, 호출어, 버튼 중 하나로 Agent를 호출한다.
2. 현재 화면, 선택 객체, 사용자 권한, Workspace 상태가 ContextPayload로 구성된다.
3. 총괄 Agent가 요청 의도를 분류한다.
    - 질문 답변
    - 추천 생성
    - 데이터 생성/수정/삭제
    - 외부 API 연동
    - 처리 불가 요청
4. 필요한 하위 Agent 또는 워크플로우를 선택한다.
5. 하위 Agent는 관련 Workspace 맥락을 검색한다.
6. Agent는 답변, 추천안, 실행 계획, 확인 카드를 생성한다.
7. 실제 데이터 변경이 필요한 경우 실행 확인 정책을 거친다.
8. 사용자가 승인하면 기능 API 또는 외부 API를 실행한다.
9. 실행 결과 또는 실패 사유를 사용자에게 안내한다.
10. Agent 실행 로그와 사용자의 승인/거절/수정 이력을 저장한다.

---

### Agent 응답 정책

- Agent는 단순 자연어 답변만 제공하지 않고, 가능한 경우 구조화된 결과를 함께 제공한다.
- Agent가 생성한 추천안은 사용자가 검토할 수 있는 카드 형태로 제공한다.
- Task, Issue, Report, Canvas, 알림처럼 실제 Workspace 데이터가 변경되는 작업은 사용자 승인 전 자동 실행하지 않는다.
- Agent는 사용자가 현재 보고 있는 화면과 선택한 객체를 기준으로 응답해야 한다.
- Agent는 권한이 없는 데이터나 불필요한 개인정보를 응답에 포함하지 않는다.
- Agent는 분석 결과를 단정하지 않고, 근거가 부족한 경우 불확실성을 표시한다.
- PR 위험 분석은 “취약점 확정”처럼 표현하지 않고 “리뷰 주의 지점”으로 안내한다.
- Agent 실패 시 실패를 숨기지 않고 원인과 재시도 방법 또는 수동 처리 방법을 안내한다.
- 같은 알림이나 제안을 반복해서 보내지 않도록 중복 알림을 제한한다.
- 사용자의 승인, 거절, 수정 이력은 이후 추천 품질 개선에 활용한다.

---

### 데이터 변경 승인 정책

Agent는 다음 작업을 실행하기 전 사용자 확인을 반드시 받아야 한다.

| 승인 필요 작업 | 예시 |
| --- | --- |
| Task 생성/수정/삭제 | Task 후보 저장, 담당자 변경, 마감일 변경, 상태 변경 |
| GitHub Issue 생성/수정 | Issue 생성, 라벨 지정, Task와 Issue 연결 |
| Report 확정 | 회의 Report 저장, Action Item 확정 |
| Canvas 변경 | Canvas 자동 배치 적용, 노드 생성, 연결선 생성 |
| 알림 발송 | 특정 사용자에게 작업 알림 또는 리뷰 요청 발송 |
| GitHub 동기화에 따른 상태 변경 | PR Merge 후 Task 상태 자동 변경 등 |
| 팀원 역할 변경 | 담당 영역 변경, 역할 분담 저장 |
| 외부 API 호출 | GitHub API, STT API 등 외부 서비스 실행 |

다음 작업은 사용자 확인 없이 자동으로 수행할 수 있다.

| 자동 수행 가능 작업 | 예시 |
| --- | --- |
| 자연어 답변 | 질문 답변, 기능 설명 |
| 요약 생성 | PR 요약, 회의 초안 요약, 주간 요약 초안 |
| 추천안 생성 | 기술스택 후보, Task 후보, 담당자 후보 |
| 미리보기 생성 | Issue 생성 미리보기, Canvas 정리 미리보기 |
| 체크리스트 생성 | Merge 전 체크리스트, 회의 준비 체크리스트 |
| 오류 안내 | 실패 원인 설명, 재시도 방법 안내 |

---

### 주요 기능 상세

#### 1. 프로젝트 시작 가이드

Workspace 생성 직후 Agent는 프로젝트 운영에 필요한 최소 정보를 단계적으로 질문한다.

Agent가 확인하는 정보는 다음과 같다.

- 프로젝트 아이디어
- 프로젝트 기간
- 팀원 수
- 산출물 목표
- 팀원별 기술 경험
- GitHub 사용 경험
- 배포 경험
- 주당 작업 가능 시간

Agent는 처음부터 긴 양식을 요구하지 않고, 사용자의 답변을 바탕으로 ProjectBrief 초안을 생성한 뒤 부족한 정보를 추가 질문한다.

---

#### 2. 기술스택 추천 및 점검

Agent는 프로젝트 목표, 팀 수준, 기간, 기능 요구, 배포 필요 여부를 바탕으로 2개 이상의 기술스택 후보를 제안한다.

각 후보에는 다음 정보가 포함된다.

- 추천 기술스택
- 추천 이유
- 장점
- 단점
- 학습 부담
- 구현 리스크
- 대체안
- 최종 추천안

사용자가 직접 기술스택을 입력한 경우, Agent는 기능 요구와 팀 역량에 비해 과한 기술, 누락된 기술, 충돌 가능성을 점검한다.

---

#### 3. MVP 기능 분해

Agent는 ProjectBrief와 기술스택, 기간, 팀원 수를 바탕으로 기능을 다음 기준으로 분류한다.

- Must: MVP 검증에 반드시 필요한 기능
- Should: 가능하면 포함하면 좋은 기능
- Could: 후순위 기능
- Excluded: 이번 범위에서 제외할 기능

기능 분해 결과는 이후 Task 분해, 역할 분담, 마일스톤 생성의 기준 데이터로 사용된다.

---

#### 4. 역할 분담 및 마일스톤 생성

Agent는 팀원별 경험, 희망 역할, 가용 시간, 기능 목록을 바탕으로 역할 분담 후보를 제안한다.

역할 분담 결과에는 다음 정보가 포함된다.

- 담당 영역
- 추천 담당자
- 추천 이유
- 작업 편중 여부
- 조정이 필요한 위험 요소

이후 Agent는 프로젝트 기간에 맞춰 기획, 설계, 개발, 리뷰, 발표 단계를 주차별 마일스톤으로 나눈다.

---

#### 5. Task 분해

Agent는 확정된 기능을 실제 개발 가능한 작은 작업 단위로 분해한다.

Task 후보는 다음 조건을 만족해야 한다.

- 하루 안에 처리 가능한 단위
- 담당자 1명이 명확한 단위
- 완료 조건이 있는 단위
- GitHub Issue 또는 PR과 연결 가능한 단위
- 너무 큰 경우 하위 Task로 나눌 수 있는 단위

Task 후보에는 제목, 설명, 추천 담당자, 추천 마감일, 완료 조건이 포함된다.

Task 생성 전에는 중복 Task 탐지를 수행하고, 사용자가 승인한 경우에만 실제 Task로 저장한다.

---

#### 6. GitHub Issue 연결 및 동기화

Agent는 확정된 Task를 GitHub Issue 형식으로 변환하고 생성 전 미리보기를 제공한다.

Issue 생성 미리보기에는 다음 정보가 포함된다.

- Issue 제목
- Issue 본문
- 라벨
- 연결 Task
- 연결 Milestone
- 완료 조건

GitHub Issue 또는 PR 상태가 변경되면 Agent는 서비스 내부 Task/PR 상태와 동기화한다. 단, 자동 상태 변경이 충돌을 일으킬 가능성이 있는 경우 사용자 확인을 요청한다.

---

#### 7. 회의 세션 및 Report 생성

Agent는 일반 음성채팅과 Report 생성을 위한 회의 세션을 구분한다.

회의 세션 중 기록되는 정보는 다음과 같다.

- 회의 제목
- 참석자
- 현재 안건
- 채팅
- Canvas 이벤트
- 메모
- 투표 결과
- Task 변경
- 관련 Issue/PR
- 음성 요청 텍스트

회의 종료 후 Agent는 다음 항목을 포함한 ReportDraft를 생성한다.

- 회의 요약
- 주요 논의
- 결정사항
- 보류사항
- 후속 작업
- 생성할 Task 후보
- 연결된 GitHub Issue/PR
- 다음 회의 안건

Report는 사용자가 수정하고 확정할 수 있어야 하며, 후속 작업은 Task 후보로 변환된다.

---

#### 8. PR 리뷰 지원

Agent는 GitHub PR을 불러와 초보 리뷰어가 변경 의도와 리뷰 순서를 이해할 수 있도록 돕는다.

PR 리뷰 과정은 다음과 같다.

1. PR 전체 의도 요약
2. 주요 변경 파일 안내
3. 파일, 함수, API, 컴포넌트, DB 모델 단위의 ReviewGraph 생성
4. 노드별 역할과 수정 이유 설명
5. 리뷰 질문 생성
6. 리뷰 주의 지점 표시
7. 노드별 문제 없음 / 논의 필요 / 판단 불가 선택
8. 전체 리뷰 결과 요약
9. Merge 전 체크리스트 생성

Agent는 최종 Merge 여부를 판단하지 않고, 사용자가 확인해야 할 항목을 정리해준다. 실제 Merge는 GitHub에서 사용자가 수행한다.

---

#### 9. 작업 트래킹 및 알림

Agent는 Task, Issue, PR, Report 상태를 주기적으로 확인하고 다음 상황을 감지한다.

- 마감일이 지난 Task
- Blocked 상태가 오래 지속된 Task
- 리뷰 대기 중인 PR
- 담당자가 없는 Task
- 마일스톤 마감에 비해 진행이 부족한 작업
- 회의에서 결정됐지만 Task로 연결되지 않은 Action Item

Agent는 감지된 문제를 비난형 문구가 아닌 다음 행동 중심으로 안내한다.

예를 들어 다음과 같이 제안한다.

- “로그인 API Task의 마감일이 지났습니다. 담당자에게 상태 확인을 요청할까요?”
- “리뷰 대기 중인 PR이 있습니다. 리뷰어를 지정하거나 회의 안건에 추가할 수 있습니다.”
- “회의에서 결정된 후속 작업 중 아직 Task로 생성되지 않은 항목이 있습니다.”

---

#### 10. 오류 및 실패 처리

Agent 실행 중 실패가 발생하면 실패 원인을 사용자에게 숨기지 않고 안내한다.

처리 대상 오류는 다음과 같다.

- Agent 응답 실패
- STT 변환 실패
- GitHub 권한 부족
- GitHub API 호출 실패
- Task/Issue 동기화 충돌
- 권한 없는 데이터 접근
- Canvas 변경 실패

오류 발생 시 Agent는 다음 중 하나 이상의 대안을 제공한다.

- 재시도
- 권한 다시 연결
- 수동 처리 방법 안내
- 요청 내용 수정
- 관리자에게 문의
- 현재 상태 저장 후 나중에 다시 시도

---

### 수용 조건

- Agent는 사용자의 요청 의도를 분류하고 적절한 하위 Agent 또는 기능 API를 선택할 수 있어야 한다.
- Agent는 현재 화면, 선택 객체, Workspace 맥락을 바탕으로 응답해야 한다.
- Agent는 프로젝트 시작 시 필요한 질문을 단계적으로 제공해야 한다.
- Agent는 사용자의 답변을 바탕으로 ProjectBrief를 생성해야 한다.
- Agent는 ProjectBrief를 바탕으로 기술스택 후보, MVP 기능 목록, Task 후보를 생성해야 한다.
- Agent가 생성한 Task 후보는 사용자가 승인해야 실제 Task로 저장된다.
- Agent는 Task를 GitHub Issue로 생성하기 전 미리보기를 제공해야 한다.
- Agent는 회의 종료 후 논의, 결정, 보류, 후속 작업을 분리한 ReportDraft를 생성해야 한다.
- Agent는 회의 후속 작업을 Task 후보로 변환할 수 있어야 한다.
- Agent는 PR의 목적, 변경 범위, 주요 파일, 리뷰 순서를 설명해야 한다.
- Agent는 PR 변경 파일과 함수 관계를 그래프 형태로 구조화할 수 있어야 한다.
- Agent는 노드별 리뷰 질문과 Merge 전 체크리스트를 생성해야 한다.
- Agent는 지연 Task, 리뷰 대기 PR, 담당자 누락 작업을 감지할 수 있어야 한다.
- Agent는 실제 데이터 변경 작업 전 사용자 승인 절차를 거쳐야 한다.
- Agent는 실행 완료 또는 실패 결과를 사용자에게 안내해야 한다.
- Agent의 주요 결과는 Workspace 맥락과 연결되어야 한다.
- Agent의 제안, 실행 결과, 사용자 승인/거절 이력은 Agent 실행 로그로 저장되어야 한다.

---

## 5.4 프로젝트 시작 가이드

### MVP

MVP 단계에서는 프로젝트가 처음인 팀만 고려하여, 기존 프로젝트 불러오기 기능은 잠시 배제한다.

### 기능 목적

빈 화면에서 시작하는 초보 팀이 프로젝트 목표, 범위, 기술스택, 역할, 일정을 정할 수 있게 돕는다. Workspace를 처음 생성하면, 설문형식으로 질문이 제공되어야 함.  (Ai Agent에 정의된 내용을 참고해 하나로 통일 필요)

### 사용자 흐름

1. Owner가 Workspace를 생성한다.
2. Agent가 프로젝트 시작 질문을 제공한다.
3. 사용자가 프로젝트 목표, 기간, 팀원 수, 팀원 수준을 입력한다.
4. Agent가 기술스택 후보를 추천한다.
5. Agent가 기능을 MVP / 후순위 / 제외 기능으로 분류한다.
6. Agent가 Task를 생성한다.
7. 사용자가 Task 후보를 승인하거나 수정한다.
8. 승인된 Task가 Task 목록에 생성된다.
9. [개발] 라벨이 붙은 Task는 GitHub Issue로 생성된다. 양방향 연동 가능해야 한다.
10. Agent가 첫 회의 아젠다를 제안한다.

### 입력 항목 예시

| 항목 | 설명 |
| --- | --- |
| 프로젝트 이름 | 프로젝트명 |
| 프로젝트 목표 | 만들고자 하는 서비스 설명 |
| 프로젝트 기간 | 예: 5주, 2개월 |
| 팀원 수 | 예: 5명 |
| 팀원 경험 수준 | 초급, 중급 등 |
| 선호 기술스택 | 프론트엔드, 백엔드, DB, AI, 인프라 등 |
| 제약 조건 | 기간, 배포 환경, 학습 목표 등 |

### 출력 항목 예시

| 항목 | 설명 |
| --- | --- |
| 프로젝트 요약 | Agent가 정리한 프로젝트 개요 |
| 추천 기술스택 | 후보, 장점, 단점, 난이도 |
| MVP 기능 | 반드시 구현해야 할 기능 |
| 후순위 기능 | 시간이 남으면 구현할 기능 |
| 제외 기능 | MVP에서 제외할 기능 |
| Task 후보 | 기능별 작업 단위 |
| 일정 추천 | 주차별 마일스톤 |
| 역할 추천 | 팀원별 담당 영역 |

---

## 5.5 Task 관리

### 기능 목적

프로젝트 작업을 Task 단위로 관리하고 GitHub Issue와 연결한다.

### Task 상태

```
To Do 
→ In Progress 
→ Review 
→ Done

Blocked
```

### 주요 기능

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| Task 생성 | 제목, 설명, 담당자, 마감일, 상태 입력, 라벨 | Must |
| Task 목록 조회 | Workspace 내 Task 목록 조회 | Must |
| Task 상세 조회 | 설명, 담당자, 상태, 연결 정보 확인 | Must |
| Task 수정 | 제목, 설명, 담당자, 마감일 수정 | Must |
| Task 삭제 | 불필요한 Task 삭제 | Should |
| 상태 변경 | To Do, In Progress, Review, Done, Blocked 변경 | Must |
| 담당자 지정 | 팀원 중 담당자 지정 | Must |
| 마감일 설정 | Task 마감일 설정 | Must |
| 우선순위 설정 | Low, Medium, High 설정 | Should |
| GitHub Issue 연결 | Task와 Issue 연결 | Must |
| Agent Task 추천 | Agent가 Task 후보 생성 | Must |
| 일정 보기 | 날짜/주차 기준 Task 확인 | Should |
| Task 라벨 | 개발 / 회의 / 기획  | Must |
| Agent Task 후보 승인 플로우 | Agent가 추천해준 작업에 대해서 Task화 할것인지 선택지 제공 | Must |

### Task 필드

| 필드 | 설명 |
| --- | --- |
| id | Task 고유 ID |
| workspaceId | 소속 Workspace |
| title | Task 제목 |
| description | Task 설명 |
| status | To Do, In Progress, Review, Done, Blocked |
| priority | Low, Medium, High |
| taskType |  |
| assigneeId | 담당자 |
| dueDate | 마감일 |
| sourceType | Manual, Agent, Meeting, GitHub |
| sourceId |  |
| githubIssueId | 연결된 GitHub Issue |
| relatedPrId | 연결된 PR |
| createdBy |  |
| createdAt | 생성일 |
| updatedAt | 수정일 |
| deletedAt |  |

## PR 연결(db 설계시 참고)

Task에 `relatedPrId` 하나만 두기보다 연결 테이블을 추천합니다.

```
- task_pull_requests
- id
- taskId
- pullRequestId
- createdAt
```

### 수용 조건

- 사용자는 Task를 생성, 수정, 삭제할 수 있어야 한다.
- Task는 반드시 하나의 Workspace에 속해야 한다.
- [개발]태그가 붙은 Task는 GitHub Issue와 1:1 연결되어야 한다.
- 개발 Task는 GitHub Issue로 전환할 수 있어야 한다.
- 개발 이외의 태그가 붙은 Task는 GitHub Issue와 연결되지 않아도 된다.
- Agent가 제안한 Task는 사용자의 승인 후 생성되어야 한다.

### 정책 수정 제안

- Task는 반드시 하나의 Workspace에 속한다.
- Task는 개발 / 기획 / 회의 / 기타 중 하나의 타입을 가진다.
- 개발 타입 Task는 GitHub Issue 연결을 권장한다.
- 개발 타입 Task는 사용자가 “Issue 생성” 버튼을 누르면 GitHub Issue로 생성된다.
- GitHub Issue가 생성되면 issueNumber, issueUrl, repositoryId를 Task에 저장한다.
- 하나의 Task는 MVP에서 최대 하나의 GitHub Issue와 연결된다.
- 하나의 PR은 여러 Task와 연결될 수 있다.
- PR은 GitHub에서 생성하고, PILO에서는 조회/분석/Task 연결만 제공한다.
- MVP에서는 GitHub Issue/PR 상태를 자동 동기화하지 않고, 사용자가 수동 새로고침할 수 있다.
- Agent가 제안한 Task는 바로 생성하지 않고, 사용자가 승인한 항목만 생성한다.

---

## 5.6 GitHub 연동

### 기능 목적

PILO의 Task와 실제 개발 작업인 GitHub Issue, PR을 연결한다.

### 주요 기능

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| GitHub 계정 연동 | 사용자의 GitHub 계정 연결 | Must |
| Repository 연결 | Workspace와 GitHub Repository 연결 | Must |
| Issue 생성 | Task를 GitHub Issue로 생성 | Must |
| Issue 동기화 | GitHub Issue 상태를 Task에 반영 | Must |
| PR 목록 조회 | 연결 Repository의 PR 불러오기 | Must |
| PR 상세 조회 | PR 제목, 설명, 작성자, 상태, 변경 파일 조회 | Must |
| PR과 Task 연결 | PR을 관련 Task와 연결 | Must |
| PR 상태 추적 | Open, Closed, Merged 상태 반영 | Should |
| Webhook 수신 | Issue/PR 변경 이벤트 수신 | MVP 제외 |
| 기존 Github issue 연결 |  | MVP 제외 |
| Issue 생성 템플릿 |  | MVP 제외 |
| GitHub Issue 연결 해제 |  | MVP 제외 |
| Workspace 멤버와 GitHub 계정 매핑 |  | MVP 제외 |
| PR diff 크기 제한 |  | MVP 제외 |
| PR 목록 필터 |  | MVP 제외 |

### GitHub Issue 연동 정책

- PILO Task에서 GitHub Issue를 생성할 수 있다.
- GitHub Issue 번호와 URL을 Task에 저장한다.
- GitHub Issue의 상태 변경은 PILO Task 상태와 동기화할 수 있다.
- 자동 동기화가 실패할 경우 수동 새로고침을 제공한다.

### GitHub PR 연동 정책

- PR은 GitHub에서 생성한다.
- PILO는 PR을 불러와 분석하고 리뷰를 돕는다.
- MVP에서는 PILO 안에서 직접 Merge하지 않는다.
- Merge는 GitHub에서 수행한다.

### 수용 조건

- Workspace는 하나의 GitHub Repository와 연결될 수 있어야 한다.
- Task에서 GitHub Issue를 생성하면 Issue URL이 Task에 저장되어야 한다.
- PR이 생성되면 PILO에서 해당 PR을 조회할 수 있어야 한다.
- PR은 하나 이상의 Task와 연결될 수 있어야 한다.

### github issue 연결 정보

```markdown
githubIssueId
githubIssueNumber
githubIssueUrl
githubIssueState
githubRepositoryId
lastSyncedAt
```

## PR 연결

Task에 `relatedPrId` 하나만 두기보다 연결 테이블을 추천합니다.

```
- task_pull_requests
- id
- taskId
- pullRequestId
- createdAt
```

## 가장 중요한 리스크

## 1. GitHub 토큰 권한과 보안

GitHub access token을 저장해야 한다면 암호화가 필요합니다. 해시 함수 결과를 저장하고, 확인

최소한 다음 원칙은 있어야 합니다.

```
- access token은 평문 저장 금지
- DB 저장 시 암호화
- 로그에 token 출력 금지
- repo 접근 실패 시 사용자에게 재연동 안내
```

MVP라도 이건 꼭 지켜야 합니다.

---

## 2. Task와 GitHub Issue 상태 매핑

상태 매핑을 명확히 해야 합니다.

GitHub Issue는 기본적으로 `open`, `closed` 정도입니다.

PILO Task는 더 많습니다.

```
To Do
In Progress
Review
Done
Blocked
```

따라서 자동 매핑은 제한적입니다.

추천 매핑은 다음입니다.

```
GitHub Issue open
→ Task 상태 자동 변경하지 않음

GitHub Issue closed
→ Task를 Done으로 변경할지 사용자에게 제안
```

MVP에서 GitHub 상태가 바뀌었다고 PILO 상태를 바로 바꾸면 혼란이 생길 수 있습니다.

---

## 3. “개발 Task = Issue 필수” 정책

이건 제품 철학은 좋지만 UX가 뻣뻣해질 수 있습니다.

초보 팀은 처음부터 Issue 단위가 명확하지 않을 수 있습니다.

→ 개발 Task는 GitHub Issue로 전환할 수 있어야 한다. 하지만 반드시 issue로 전환되는 것은 아니다.(필수 아님)

---

## 5.7 회의 / Report

### 기능 목적

회의 녹화와 종료 사이에 수행된 모든 정보(회의에서 나온 논의, 결정사항, 후속 작업, 캔버스의 동작, Task 수정 등)를 트래킹하여 Report로 정리하고 실제 Task로 연결한다.

음성회의를 STT를 이용하여 모든 내용을 전사하고, 그중 Task로 뽑을 수 있는 것들을 agent가 판단하여, 사용자들에게 제시한다.

### 입력 데이터

| 입력 | 설명 |
| --- | --- |
| 챗봇과의 채팅내역 | 회의와 관련된 내용만 포함 |
| Canvas 작업 | 회의 중 생성/수정된 Canvas 노드,
노드의 내용까지 포함 |
| 메모 | 회의 메모 (회의중일 때만 작성가능한 메모) |
| canvas에서 진행된 투표 결과 | MVP 제외 |
| Task 변경 | 회의 중 생성/수정된 Task |
| GitHub Issue/PR | 회의에서 언급된 개발 작업 |
| 음성 transcript | 회의 중 녹음된 음성의 모든 내용을 전사하여, 그것을 기반으로 회의록 작성 |

### Report 포함 내용

| 항목 | 설명 |
| --- | --- |
| 회의 요약 | 전체 회의 내용 요약 |
| 주요 논의 | 논의된 주제 목록 |
| 결정사항 | 최종 결정된 내용 |
| 생성된 Task | 회의 결과 생성된 Task |
| 연결된 GitHub Issue | 관련 Issue 목록 |
| 후속 작업 | 앞으로 해야 할 작업 |
| 다음 회의 안건 | 다음 회의에서 다룰 내용 |

### 사용자 흐름

1. 사용자가 회의 시작버튼을 눌러 회의를 기록하기 시작한다.
2. 회의 중 채팅, 메모, Canvas 작업, Task 생성/삭제등 모든 정보들이 기록된다.
3. 사용자가 회의 종료버튼을 눌러 회의를 종료한다.
4. Agent가 Report 생성 후보를 만든다.
5. 사용자가 Report를 확인하고 수정 또는 삭제한다.
6. Report를 저장한다.
7. 후속 작업을 Task로 생성한다.
8. 개발 태그가 붙은 Task는 GitHub Issue와 연결한다.

### 주요 기능

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| 회의 시작 | Workspace 또는 Canvas에서 회의 시작 | Must |
| 회의 메모 작성 | 텍스트 메모 작성 | Must |
| 회의 종료 | 회의 세션 종료 | Should |
| Report 생성 | Agent가 회의 내용을 Report로 정리 | Must |
| Report 수정 | 사용자가 Report 내용 수정 | Should |
| Task 전환 | 후속 작업을 Task로 생성 | Must |
| Issue 연결 | 생성된 Task를 GitHub Issue와 연결 | Should |
| Report 조회 | 과거 Report 목록/상세 조회 | Must |

### 수용 조건

- 사용자는 회의 내용을 텍스트로 기록할 수 있어야 한다.
- Agent는 회의 내용을 요약하고 결정사항과 후속 작업을 분리해야 한다.
- 사용자는 후속 작업을 선택하여 Task로 생성할 수 있어야 한다.
- Report는 Workspace에 저장되어야 한다.

---

## 5.8 Canvas

### 기능 목적

Canvas는 Workspace 안의 회의, 기획, Task, GitHub Issue, PR, Report, 파일, 코드, 아이디어를 하나의 보드 위에 올려놓고 연결하여, 팀이 프로젝트의 전체 맥락을 이해하고 다음 행동으로 이어갈 수 있게 한다.

### Canvas의 역할

Canvas는 Workspace의 중심 작업 보드이다.

사용자는 Canvas에서 프로젝트와 관련된 거의 모든 맥락을 올려놓고, 연결하고, 정리하고, 다음 행동으로 이어갈 수 있다.

Canvas는 다음 역할을 한다.

- 회의 중 나온 메모, 아이디어, 결정 사항, Action Item을 바로 정리한다.
- Task, GitHub Issue, PR, Report, File, Code 같은 프로젝트 객체를 보드 위에 배치한다.
- Memo, Drawing, Frame, Code Block 같은 Canvas 전용 객체를 직접 만든다.
- 객체 간의 관계, 의존성, 진행 흐름, 리스크를 연결선으로 표현한다.
- 작업, 회의, 리뷰, 기획 화면으로 이동하거나 관련 액션을 시작하는 진입점이 된다.
- Agent가 프로젝트 맥락을 이해하고 관계, 누락된 작업, 다음 행동을 제안할 수 있는 작업 공간이 된다.
- 팀원이 프로젝트의 전체 흐름과 현재 상황을 한눈에 파악할 수 있게 한다.

단, Canvas가 모든 원본 데이터를 직접 소유하는 것은 아니다.

Task, GitHub Issue, PR, Report, File, Code Reference 같은 원본 데이터는 각 도메인이 소유하고, Canvas는 이를 참조해 보드 위에 배치한다.

Memo, Drawing, Frame, Code Block, 임시 아이디어처럼 Canvas 안에서만 의미가 있는 객체는 Canvas가 직접 소유한다.

### 주요 기능

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| Canvas Board 생성 | Workspace 안에 새로운 작업 보드를 생성한다. | Must |
| Canvas Board 조회 | Workspace의 Canvas 목록과 특정 Canvas의 상세 내용을 조회한다. | Must |
| 보드 이동 / 확대 / 축소 | 넓은 보드 위를 자유롭게 이동하고 확대/축소한다. | Must |
| Memo 객체 | 회의 메모, 아이디어, 임시 정리 내용을 Canvas에 직접 작성한다. | Must |
| Drawing 객체 | 간단한 도형, 선, 필기 등 자유 시각 요소를 추가한다. | Should |
| Frame 객체 | 관련 노드와 메모를 묶는 구역을 만든다. | Should |
| Code Block 객체 | Canvas 안에서 코드 메모나 예시 코드를 직접 작성한다. | Should |
| Vote 객체 | 회의 중 선택지와 투표 결과를 Canvas에 정리한다. | Could |
| Task 노드 | 기존 Task를 Canvas 위에 배치하고 작업 상세로 이동한다. | Must |
| Report 노드 | 회의 Report를 Canvas 위에 배치하고 회의 내용으로 이동한다. | Should |
| Issue / PR 노드 | GitHub Issue와 Pull Request를 Canvas 위에 배치하고 원본으로 이동한다. | Should |
| File 노드 | 이미지, PDF, 문서 등 Shared File을 Canvas 위에 배치한다. | Could |
| Code Reference 노드 | 코드 파일, 함수, 라인 범위, 리뷰 지점을 Canvas 위에 배치한다. | Must |
| 연결선 | 노드 간 의존성, 흐름, 참조, 리스크 관계를 연결한다. | Must |
| 노드 상세 패널 | 선택한 노드의 요약 정보, 연결 관계, 원본 화면 이동 액션을 제공한다. | Must |
| 관련 액션 실행 | 노드에서 Task 생성, Issue 생성, Report 열기, PR 리뷰 보기 등 관련 액션을 시작한다. | Should |
| Agent 관계 제안 | Agent가 관련 노드, 누락된 연결, 다음 행동을 제안한다. | Should |
| Agent 배치 제안 | Agent가 보드 정리와 자동 배치안을 제안하고 사용자가 승인하면 반영한다. | Could |
| 실시간 협업 | 여러 사용자가 같은 Canvas를 보며 노드 위치와 연결 상태를 공유한다. | Could |

### Canvas 객체 / 노드 유형

| 유형 | 설명 | 데이터 소유 |
| --- | --- | --- |
| Memo | 회의 메모, 아이디어, 임시 정리 내용 | Canvas |
| Drawing | 도형, 선, 필기 등 자유 시각 요소 | Canvas |
| Frame | 여러 노드와 메모를 묶는 구역 | Canvas |
| Code Block | Canvas 안에서 직접 작성하는 코드 메모 또는 예시 코드 | Canvas |
| Vote | 회의 중 선택지와 투표 결과 | Canvas |
| Task | 작업 항목. 상태, 담당자, 마감일은 Task 도메인의 원본 데이터를 참조한다. | Task |
| Report | 회의 Report. 회의 요약, 결정 사항, Action Item을 참조한다. | Meeting |
| Issue | GitHub Issue. 제목, 상태, 라벨, 담당자를 참조한다. | GitHub |
| PR | GitHub Pull Request. 리뷰 상태, 변경 파일, 머지 상태를 참조한다. | GitHub |
| File | 문서, 이미지, PDF 등 업로드 파일을 참조한다. | Shared File |
| Code Reference | 코드 파일, 함수, 라인 범위, 리뷰 지점을 참조한다. | GitHub / Review |
| Decision | 회의나 기획에서 나온 결정 사항을 정리한다. | Meeting / Planning |
| Risk | 일정, 구현, 리뷰, 설계 리스크를 정리한다. | Planning / Review |
| Agent Suggestion | Agent가 제안한 노드, 연결, 다음 행동 후보 | Agent / Canvas |

Memo, Drawing, Frame, Code Block, Vote처럼 Canvas 안에서만 의미가 있는 객체는 Canvas가 직접 소유한다.

Task, Report, Issue, PR, File, Code Reference처럼 다른 도메인의 원본 객체가 있는 노드는 Canvas가 원본 데이터를 복사하지 않고 해당 객체의 ID를 참조한다.

### 연결선 유형

| 연결 | 설명 |
| --- | --- |
| related_to | 일반 관련 |
| depends_on | 의존 관계 |
| blocks | 한 작업이 다른 작업을 막음 |
| implements | PR 또는 코드가 Task를 구현함 |
| linked_issue | Task와 GitHub Issue가 연결됨 |
| reviewed_by | PR이 리뷰 결과와 연결됨 |
| risk_for | 리스크가 특정 Task, PR, 계획과 연결됨 |
| decision_for | 결정 사항이 특정 작업이나 계획과 연결됨 |
| references | 문서, 파일, 코드 등을 참고함 |

### 수용 조건

- 사용자는 Workspace 안에서 Canvas Board를 생성하고 조회할 수 있어야 한다.
- 사용자는 Canvas Board 상세 화면에서 노드와 연결선을 볼 수 있어야 한다.
- 사용자는 Canvas 화면을 이동하고 확대/축소할 수 있어야 한다.
- 사용자는 Canvas에 Memo, Drawing, Frame, Code Block 같은 Canvas 전용 객체를 추가할 수 있어야 한다.
- 사용자는 Task, Report, Issue, PR, File, Code Reference 같은 프로젝트 객체를 Canvas 노드로 배치할 수 있어야 한다.
- 사용자는 노드의 위치를 이동하고 크기를 조정할 수 있어야 한다.
- 사용자는 노드 간 연결선을 만들고 삭제할 수 있어야 한다.
- Canvas 전용 객체는 Canvas가 직접 저장해야 한다.
- 외부 도메인 노드는 원본 데이터를 복사하지 않고 원본 객체 ID를 참조해야 한다.
- Canvas에서 외부 도메인 노드를 삭제해도 원본 Task, Report, Issue, PR, File, Code는 삭제되지 않아야 한다.
- 사용자는 노드를 선택했을 때 원본 데이터 요약, 연결 관계, 관련 액션을 볼 수 있어야 한다.
- 사용자는 노드 상세 패널에서 원본 화면으로 이동하거나 관련 작업을 시작할 수 있어야 한다.
- Agent 제안 기능을 제공하는 경우, 제안된 변경은 사용자 승인 전까지 실제 Canvas Board에 반영되면 안 된다.
- 사용자는 자신이 속한 Workspace의 Canvas만 조회하고 수정할 수 있어야 한다.
- Workspace Member는 기본적으로 Canvas를 조회하고 편집할 수 있어야 한다.
- Workspace Owner는 Canvas Board 삭제 또는 보관 같은 관리 작업을 할 수 있어야 한다.

---

## 5.9 Code Review Room

### 기능 목적

초보 개발자가 GitHub PR의 변경 의도, 파일 관계, diff를 이해하고 리뷰 판단을 남길 수 있도록 돕는다.        

### 사용자 흐름

1. 리뷰어(멤버)가 PR Review Room에 입장한다.
2. 원하는 PR을 선택한다.
3. Agent가 PR 전체 의도를 요약한다.
4. 변경 파일, API 흐름이 노드 그래프로 시각화된다.
    1. 단순히 연결만 한 것이 아니라, 실제로 사용자가 이해하며 리뷰할 수 있도록 순서를 고려하여 Workflow 생성
    2. 코드의 위험도에 따라 노드 색상 다르게 출력
    3. 만약 Conflict가 발생한 PR이면 경고 아이콘을 노드에 붙힘
5. 사용자가 노드를 클릭한다.
6. 선택 노드의 역할, 수정 이유, diff, 관련 파일, 리뷰 포인트를 확인한다.
7. 각 노드에 대해 문제 없음 / 논의 필요 / 판단 불가를 선택한다.
8. Agent가 전체 리뷰 결과를 요약한다.
    1. 수정을 위해 agent한테 넘길 프롬프트 추천
9. Merge를 진행한다.

### MVP

- MVP 단계에서 Merge 기능은 제공하지 않는다.

### 주요 기능

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| PR 선택 | 연결 Repository의 PR 선택 | Must |
| PR 전체 요약 | Agent가 변경 목적 요약 | Must |
| 변경 파일 목록 | PR에서 변경된 파일 목록 표시 | Must |
| diff viewer | 파일별 diff 확인 | Must |
| 노드 그래프 | 변경 파일/함수/API 흐름 시각화 | Must |
| 노드 상세 | 역할, 수정 이유, 관련 파일, 리뷰 포인트 표시 | Must |
| 리뷰 판단 | 문제 없음 / 논의 필요 / 판단 불가 선택 | Must |
| 전체 리뷰 요약 | 사용자 판단과 Agent 분석을 합쳐 요약 | Must |
| Merge 체크리스트 | Merge 전 확인할 사항 제공 | Must |
| GitHub 댓글 작성 | 리뷰 결과를 GitHub 댓글로 남김 | MVP 제외 |

### 노드 상세 정보

| 항목 | 설명 |
| --- | --- |
| 노드 이름 | 파일명 |
| 노드 역할 | 프로젝트 안에서 해당 노드가 하는 일 |
| 수정 이유 | 이번 PR에서 수정된 이유 |
| 실제 수정 부분 | diff 기반 변경 내용(좌/우에 과거 코드/현재 코드) |
| 리뷰 포인트 | 리뷰어가 확인해야 할 기준 |
| 리뷰 판단 | 문제 없음 / 논의 필요 / 판단 불가 |

### 리뷰 판단 값

| 값 | 의미 |
| --- | --- |
| 문제 없음 | 현재 변경 내용에 특별한 문제가 없어 보임 |
| 논의 필요 | 팀원과 확인하거나 수정 논의 필요 |
| 판단 불가 | 리뷰어가 이해하지 못했거나 추가 설명 필요 |

### 수용 조건

- 사용자는 PR Review Room을 누르면 PR 선택창을 볼 수 있어야 한다.
- Agent는 PR 전체 의도를 요약해야 한다.
- 사용자는 변경 파일과 diff를 확인할 수 있어야 한다.
- 사용자는 각 노드에 리뷰 판단을 남길 수 있어야 한다.
- Agent는 전체 리뷰 결과와 Merge 전 체크리스트를 제공해야 한다.

---

## 5.10 채팅

### 기능 목적

팀 논의와 Agent 호출을 하나의 공간에서 처리한다.

MVP에서는 Agent 호출을 위한 챗봇형식의 채팅만 제공

### 주요 기능

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| Workspace 채팅 | Workspace 단위 채팅방 제공 | MVP 제외 |
| 메시지 전송 (Agent only) | 텍스트 메시지 전송 | MVP 제외 |
| 메시지 조회 | 이전 메시지 조회 | Should |
| @Agent 호출 | 특정 명령으로 Agent 호출 | Must |
| 메시지 기반 Task 생성 | 메시지를 Task 후보로 변환 | Should |
| 메시지 기반 Report 반영 | 메시지를 회의 Report에 반영 | Should |

### Agent 호출 예시

```
@Agent 이 내용을 Task로 만들어줘.
@Agent 방금 결정한 내용 회의록에 추가해줘.
@Agent 로그인 기능을 Issue로 쪼개줘.
@Agent 이 PR에서 먼저 봐야 할 파일 알려줘.
```

### 수용 조건

- 사용자는 채팅에서 Agent를 호출할 수 있어야 한다.
- Agent는 채팅 내용을 기반으로 Task, Report, PR 분석을 제안할 수 있어야 한다.
- Agent가 생성한 결과는 사용자 승인 후 저장되어야 한다.

---

## 5.11 알림창

### 기능 목적

사용자에게 자신과 관련된 작업 변화, 마감일, 리뷰 요청, Agent 제안을 알려준다.

### 알림 유형

| 알림 | 설명 | 우선순위 |
| --- | --- | --- |
| Task 담당자 지정 | 내가 담당자로 지정됨 | Must |
| Task 상태 변경 | 내가 관련된 Task 상태 변경 | Should |
| 마감일 임박 | agent가 담당 Task 마감일 임박을 알려줌 | Should |
| 채팅 멘션 | @사용자 로 채팅에서 멘션되면 알림 | MVP 제외 |

### 수용 조건

- 사용자는 자신의 알림 목록을 확인할 수 있어야 한다.
- 읽지 않은 알림과 읽은 알림을 구분할 수 있어야 한다.
- 알림 클릭 시 관련 Task, Report, PR로 이동할 수 있어야 한다.

---

## 5.12 공유 드라이브 (MVP 제외)

### 기능 목적

기획 문서, 회의 자료, 이미지, PDF 등을 보관하고 Canvas, Report, PR과 연결한다.

### 주요 기능

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| 파일 업로드 | Workspace에 파일 업로드 | Could |
| 파일 목록 조회 | 업로드된 파일 목록 확인 | Could |
| 파일 상세 조회 | 파일 이름, 업로더, 생성일 확인 | Could |
| 파일 다운로드 | 파일 다운로드 | Could |
| Canvas 연결 | 파일을 Canvas 노드로 배치 | Could |
| Report 연결 | 파일을 Report에 첨부 | Could |

### MVP 정책

- 공유 드라이브는 핵심 MVP에서는 필수가 아니다.
- 다만 Canvas에서 이미지/PDF를 다룰 계획이 있다면 최소 파일 업로드 기능은 필요하다.

---

## 5.13 설정

### 기능 목적

Workspace 기본 정보, GitHub 연동, 팀원 관리 등을 설정한다.

### 주요 기능

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| Workspace 정보 수정 | 이름, 설명 수정 | Should |
| Workspace 삭제 | 삭제 | Should |
| GitHub Repository 관리 | 연결/해제. Owner만 가능하다. | Must |
| 팀원 관리 | 초대, 제거 | Should |
| 알림 설정 | 알림 유형별 On/Off | MVP 제외 |
| Agent 설정 | Agent 응답 스타일, 자동 제안 범위 설정 | MVP 제외 |

---

# 6. 핵심 화면 목록

## 6.1 로그인 / 회원가입 화면

### 화면 목적

사용자가 OAuth 계정으로 PILO에 로그인하고, 최초 로그인 시 자동으로 회원가입되어 Workspace에 접근할 수 있게 한다.

### 주요 요소

- Google OAuth 로그인 버튼
- GitHub OAuth 로그인 버튼
- 로그인 실패 또는 취소 시 에러 메시지
- 로그인 후 이동할 화면 처리
    - 초대 링크로 접근한 경우 해당 Workspace 참여 흐름으로 이동
    - 일반 로그인인 경우 최근 접근 Workspace 또는 Workspace 목록으로 이동

### 정책

- MVP에서는 이메일/비밀번호 기반 로그인은 제공하지 않는다.
- MVP에서는 별도 회원가입 폼을 제공하지 않는다.
- 최초 OAuth 로그인 시 사용자가 자동 생성된다.
- 비밀번호 재설정은 이메일/비밀번호 로그인을 도입할 때 검토한다.

## 6.2 Workspace 목록 화면

### 화면 목적

사용자가 자신이 속한 Workspace를 확인하고, 새로운 Workspace를 만들거나 최근 작업하던 Workspace로 진입할 수 있게 한다.

### 주요 요소

- 내가 속한 Workspace 목록
- Workspace 이름
- Workspace 설명 또는 프로젝트 유형
- 내 역할 표시
    - Owner
    - Member
- 최근 접근 Workspace 표시
- 새 Workspace 생성 버튼
- Workspace가 없을 때의 빈 상태 화면
- 초대 링크로 참여한 Workspace 진입 처리

### 주요 액션

- Workspace 선택 시 해당 Workspace Dashboard로 이동
- 새 Workspace 생성
- Workspace 생성 후 생성된 Workspace로 이동
- 접근 권한이 없는 Workspace 접근 시 목록 화면 또는 에러 화면으로 이동

### 정책

- 사용자는 자신이 멤버로 속한 Workspace만 볼 수 있다.
- 최근 접근 Workspace는 사용자별로 저장된다.
- URL에 특정 Workspace가 명시되어 있으면 해당 Workspace 접근 권한을 먼저 확인한다.

## 6.3 Workspace Dashboard

### 화면 목적

사용자가 특정 Workspace에 진입했을 때 프로젝트의 현재 상태를 빠르게 파악하고, Task, GitHub Issue/PR, 회의 Report, Canvas 등 주요 작업 화면으로 이동할 수 있게 한다.

Workspace Dashboard는 Workspace의 홈 화면이다.

### 주요 요소

- 현재 Workspace 이름
- Workspace 멤버 또는 내 역할 표시
- 프로젝트 요약
    - 진행 중 Task 수
    - 완료된 Task 수
    - 열린 GitHub Issue 수
    - 열린 PR 수
    - 최근 회의 Report 수
- 진행 중 Task
- 마감 임박 Task
- 최근 GitHub Issue
- 최근 GitHub Pull Request
- 최근 회의 Report
- 최근 Canvas Board
- 빠른 액션 버튼
    - Task 생성
    - 회의 시작 또는 Report 보기
    - Canvas 열기
    - GitHub Repository 연결 또는 확인
- Agent의 다음 행동 제안

### 정책

- Dashboard 데이터는 현재 선택된 Workspace 기준으로만 조회한다.
- 사용자는 자신이 속하지 않은 Workspace의 Dashboard를 볼 수 없다.
- Dashboard는 원본 데이터를 직접 소유하지 않고 Task, GitHub, Meeting, Canvas 데이터를 요약해서 보여준다.
- GitHub Repository가 연결되지 않은 Workspace에서는 GitHub Issue/PR 영역에 연결 안내를 표시한다.
- Task, 회의 Report, Canvas가 없는 경우 각각 빈 상태 화면을 제공한다.
- Agent의 다음 행동 제안은 MVP에서는 요약 또는 추천 영역으로 제공할 수 있으며, 실제 자동 실행은 사용자 승인 후에만 가능하다.

### 수용 조건

- 사용자는 Workspace 진입 후 Dashboard를 볼 수 있어야 한다.
- Dashboard에는 현재 Workspace 기준의 프로젝트 요약이 표시되어야 한다.
- 사용자는 Dashboard에서 진행 중 Task와 마감 임박 Task를 확인할 수 있어야 한다.
- 사용자는 Dashboard에서 최근 GitHub Issue/PR을 확인할 수 있어야 한다.
- 사용자는 Dashboard에서 최근 회의 Report를 확인할 수 있어야 한다.
- 사용자는 Dashboard에서 최근 Canvas Board로 이동할 수 있어야 한다.
- 사용자는 Dashboard의 빠른 액션을 통해 주요 작업 화면으로 이동할 수 있어야 한다.
- GitHub, Task, Report, Canvas 데이터가 없는 경우 빈 상태가 표시되어야 한다.

## 6.4 프로젝트 시작 가이드 화면

### 화면 목적

프로젝트 시작 가이드 화면은 사용자가 Workspace에 처음 진입했을 때, Agent와 대화하며 프로젝트의 기본 정보를 입력하고 초기 운영 구조를 만드는 화면이다.

사용자는 처음부터 긴 설정 폼을 작성하지 않고, Agent가 던지는 단계별 질문에 답하면서 프로젝트 목표, 팀원 정보, 기술스택, MVP 기능, Task 후보를 순서대로 확정한다.

이 화면의 핵심은 “빈 화면에서 무엇을 해야 할지 모르는 사용자에게 다음 행동을 자연스럽게 안내하는 것”이다.

---

### 화면 컨셉

프로젝트 시작 가이드는 화면 중앙에 배치된 Agent 대화 카드 중심으로 구성한다.

전체 화면은 복잡한 관리 도구처럼 보이지 않도록 하고, 처음 사용하는 사용자도 부담 없이 시작할 수 있도록 여백이 넓고 단순한 구조를 사용한다.

| 구성 요소 | 설명 |
| --- | --- |
| 중앙 Agent 대화 카드 | Agent 질문, 사용자 답변, 추천 결과가 표시되는 메인 영역 |
| 단계 진행 표시 | 현재 프로젝트 설정이 어느 단계까지 진행되었는지 표시 |
| 입력 영역 | 사용자가 프로젝트 정보를 입력하거나 선택지를 고르는 영역 |
| 결과 미리보기 영역 | Agent가 정리한 ProjectBrief, 기술스택, 기능 분류, Task 후보를 단계별로 표시 |
| 하단 CTA | 다음 질문 답변, 추천 결과 승인, Task 생성 등 주요 행동 버튼 표시 |

---

### 화면 레이아웃

```
┌──────────────────────────────────────────────┐
│ PILO                                         │
│                                              │
│        프로젝트를 시작해볼까요?              │
│        Agent가 단계별로 도와드릴게요.         │
│                                              │
│  [1 프로젝트 정보] [2 기술스택] [3 기능 분류] │
│  [4 Task 후보] [5 완료]                      │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ Agent                                  │  │
│  │ 어떤 프로젝트를 만들 계획인가요?        │  │
│  │                                        │  │
│  │ [프로젝트 아이디어 입력 영역]           │  │
│  │                                        │  │
│  │ [다음] [예시 보기]                     │  │
│  └────────────────────────────────────────┘  │
│                                              │
└──────────────────────────────────────────────┘
```

---

### 주요 화면 영역

| 영역 | 설명 | 우선순위 |
| --- | --- | --- |
| 시작 안내 영역 | “프로젝트를 시작해볼까요?”와 같은 환영 문구와 화면 목적을 표시한다. | Must |
| 단계 진행 표시 | 프로젝트 정보 → 기술스택 추천 → 기능 분류 → Task 후보 → 완료 순서를 표시한다. | Must |
| Agent 질문 영역 | 현재 단계에서 Agent가 묻는 질문을 대화 형태로 표시한다. | Must |
| 사용자 입력 영역 | 텍스트 입력, 선택 버튼, 체크박스 등 현재 질문에 맞는 입력 UI를 제공한다. | Must |
| 답변 요약 영역 | 사용자가 입력한 내용을 Agent가 요약해 보여준다. | Must |
| 추천 결과 카드 | 기술스택, MVP 기능, Task 후보 등 Agent가 생성한 결과를 카드 형태로 표시한다. | Must |
| 승인/수정/다시 추천 버튼 | Agent 추천 결과를 그대로 승인하거나 수정하거나 다시 추천받을 수 있다. | Must |
| 완료 후 이동 버튼 | Task 생성 완료 후 Task Board 또는 Dashboard로 이동한다. | Must |

---

### 단계 구성

#### Step 1. 프로젝트 정보 입력

Agent는 프로젝트를 시작하기 위한 최소 정보를 단계적으로 질문한다.

| 입력 항목 | 설명 |
| --- | --- |
| 프로젝트 아이디어 | 만들고 싶은 서비스 또는 문제 상황을 입력한다. |
| 프로젝트 기간 | 전체 프로젝트 진행 기간을 입력한다. |
| 팀원 수 | 프로젝트에 참여하는 팀원 수를 입력한다. |
| 산출물 목표 | 발표, 배포, MVP, 포트폴리오 등 최종 목표를 선택한다. |
| 팀원 경험 수준 | 프론트엔드, 백엔드, AI, 인프라, GitHub 경험 수준을 간단히 입력한다. |

처음 화면에서는 모든 항목을 한 번에 보여주지 않고, Agent가 하나씩 질문한다.

예시 문구:

```
안녕하세요. 프로젝트 시작을 도와드릴게요.
먼저 어떤 서비스를 만들 계획인지 한두 문장으로 알려주세요.
```

---

#### Step 2. 프로젝트 요약 생성

사용자의 답변이 어느 정도 모이면 Agent는 ProjectBrief 초안을 생성한다.

ProjectBrief에는 다음 내용을 포함한다.

| 항목 | 설명 |
| --- | --- |
| 프로젝트 한 줄 설명 | 사용자의 아이디어를 한 문장으로 정리 |
| 문제 상황 | 이 프로젝트가 해결하려는 문제 |
| 주요 사용자 | 서비스를 사용할 대상 |
| 핵심 기능 방향 | 프로젝트에서 중요하게 다룰 기능 |
| 기간/팀 구성 | 프로젝트 기간과 팀원 수 |
| 추가 질문 | 아직 부족한 정보가 있을 경우 추가 질문 |

ProjectBrief는 카드 형태로 보여주며, 사용자는 내용을 수정하거나 다음 단계로 넘어갈 수 있다.

---

#### Step 3. 기술스택 추천 결과

Agent는 프로젝트 목표, 기간, 팀원 경험 수준을 바탕으로 2개 이상의 기술스택 후보를 추천한다.

기술스택 추천 카드는 다음 정보를 포함한다.

| 항목 | 설명 |
| --- | --- |
| 추천안 이름 | 예: 안정적인 MVP형, 학습 도전형 |
| 기술스택 구성 | Frontend, Backend, DB, AI, Infra 등 |
| 추천 이유 | 이 팀과 프로젝트에 적합한 이유 |
| 장점 | 구현 속도, 학습 난이도, 확장성 등 |
| 주의점 | 러닝커브, 배포 난이도, 협업 리스크 등 |
| 최종 추천 | Agent가 가장 적합하다고 판단한 후보 |

사용자는 기술스택을 선택하거나, 직접 수정하거나, 다시 추천받을 수 있다.

---

#### Step 4. MVP/후순위/제외 기능 분류

기술스택이 확정되면 Agent는 프로젝트 기능을 범위별로 분류한다.

| 분류 | 설명 |
| --- | --- |
| MVP 기능 | 프로젝트 검증을 위해 반드시 구현해야 하는 기능 |
| 후순위 기능 | 시간이 남으면 구현할 기능 |
| 제외 기능 | 이번 프로젝트 범위에서는 제외할 기능 |

각 기능 카드는 다음 정보를 포함한다.

- 기능명
- 기능 설명
- 포함/후순위/제외로 분류한 이유
- 예상 난이도
- 관련 기술스택
- 사용자가 분류를 변경할 수 있는 버튼

---

#### Step 5. Task 생성 후보

Agent는 확정된 MVP 기능을 실제 개발 가능한 Task 후보로 분해한다.

Task 후보 카드는 다음 정보를 포함한다.

| 항목 | 설명 |
| --- | --- |
| Task 제목 | 개발자가 바로 이해할 수 있는 작업명 |
| 설명 | 구현해야 할 내용 |
| 추천 담당자 | 팀원 경험을 바탕으로 한 담당자 후보 |
| 추천 마감일 | 프로젝트 기간과 우선순위를 고려한 마감일 |
| 완료 조건 | 이 작업이 끝났다고 판단할 기준 |
| 관련 기능 | 어떤 MVP 기능에서 나온 Task인지 |
| GitHub Issue 생성 여부 | 승인 후 Issue로 생성할 수 있는지 |

각 Task 후보에는 다음 버튼을 제공한다.

| 버튼 | 설명 |
| --- | --- |
| 승인 | 해당 후보를 실제 Task로 생성한다. |
| 수정 후 승인 | 제목, 담당자, 마감일 등을 수정한 뒤 생성한다. |
| 보류 | 지금 생성하지 않고 후보 목록에 남겨둔다. |
| 제외 | 이번에는 Task로 생성하지 않는다. |

---

#### Step 6. 완료 화면

Task 생성이 끝나면 Agent는 프로젝트 초기 설정 결과를 요약한다.

완료 화면에는 다음 정보를 표시한다.

| 항목 | 설명 |
| --- | --- |
| ProjectBrief 요약 | 프로젝트 목표와 핵심 방향 |
| 선택된 기술스택 | 팀이 확정한 기술스택 |
| MVP 기능 수 | 생성된 MVP 기능 개수 |
| 생성된 Task 수 | 실제 생성된 Task 개수 |
| GitHub Issue 생성 여부 | Issue로 연결된 Task 수 |
| 다음 추천 행동 | Task Board 확인, 팀원 초대, GitHub 연결 등 |

하단에는 다음 이동 버튼을 제공한다.

- Task Board로 이동
- Dashboard로 이동
- GitHub Repository 연결
- 팀원 초대하기

---

### Agent 대화 카드 구성

Agent 대화 카드는 프로젝트 시작 화면의 중심 요소다.

| 요소 | 설명 |
| --- | --- |
| Agent 프로필 | Agent 아이콘 또는 캐릭터, 이름 표시 |
| 현재 질문 | 사용자가 지금 답해야 하는 질문 |
| 보조 설명 | 왜 이 정보를 묻는지 간단히 설명 |
| 입력 UI | 텍스트 입력, 선택지, 체크박스 등 |
| 예시 답변 | 사용자가 막히지 않도록 짧은 예시 제공 |
| 진행 버튼 | 다음, 이전, 건너뛰기, 다시 추천 버튼 |
| 추천 결과 카드 | Agent가 생성한 구조화된 결과 표시 |

Agent 질문은 한 번에 하나의 핵심 질문만 제공한다.

좋은 예시:

```
어떤 서비스를 만들 계획인가요?
한두 문장으로 적어주면 제가 프로젝트 방향을 정리해볼게요.
```

나쁜 예시:

```
프로젝트명, 목표, 기간, 팀원 수, 기술스택, 기능 목록, 역할 분담, 배포 여부를 모두 입력해주세요.
```

---

### 시각적 구성 방향

| 항목 | 방향 |
| --- | --- |
| 전체 분위기 | 흰색 또는 연한 회색 배경을 사용해 깨끗한 느낌을 준다. |
| 중앙 카드 | 화면 중앙에 넓은 카드 형태로 배치하고 그림자와 둥근 모서리를 적용한다. |
| 강조 색상 | 주요 버튼과 현재 단계에만 포인트 컬러를 사용한다. |
| 정보 밀도 | 초기 화면에서는 정보량을 줄이고, 결과가 생성될 때만 카드가 추가되도록 한다. |
| 진행감 | 단계 표시와 완료 체크 아이콘을 사용해 프로젝트가 만들어지고 있다는 느낌을 준다. |
| 결과 카드 | 기술스택, 기능 분류, Task 후보는 각각 독립된 카드로 보여준다. |
| CTA 버튼 | 다음 단계로 이동하는 버튼은 항상 같은 위치에 둔다. |

---

### 화면 상태별 구성

#### 1. 최초 진입 상태

처음 로그인하거나 Workspace 생성 직후에는 중앙에 Agent 시작 카드만 표시한다.

표시 요소:

- 환영 문구
- Agent 소개 문장
- 시작 버튼
- “나중에 설정하기” 버튼

예시 문구:

```
프로젝트를 시작해볼까요?
제가 질문을 하나씩 드리면서 프로젝트 목표, 기술스택, MVP 기능, 첫 Task까지 정리해드릴게요.
```

---

#### 2. 질문 진행 상태

Agent가 한 단계씩 질문하고 사용자가 답변하는 상태다.

표시 요소:

- 현재 단계
- Agent 질문
- 사용자 입력창
- 예시 답변
- 이전/다음 버튼

---

#### 3. 추천 결과 확인 상태

Agent가 기술스택, 기능 분류, Task 후보를 생성한 뒤 사용자가 검토하는 상태다.

표시 요소:

- 추천 결과 카드
- 추천 이유
- 수정 버튼
- 다시 추천 버튼
- 승인 버튼

---

#### 4. 승인 대기 상태

Agent가 실제 Task를 생성하기 전 사용자 확인을 기다리는 상태다.

표시 요소:

- 생성될 Task 목록
- 생성 개수
- GitHub Issue 생성 여부
- 승인 버튼
- 수정 버튼
- 취소 버튼

예시 문구:

```
총 12개의 Task 후보를 만들었습니다.
승인하면 Task Board에 추가됩니다.
```

---

#### 5. 완료 상태

프로젝트 초기 설정이 끝난 상태다.

표시 요소:

- 설정 완료 메시지
- 생성된 ProjectBrief
- 선택된 기술스택
- 생성된 Task 수
- 다음 이동 버튼

예시 문구:

```
프로젝트 시작 준비가 끝났습니다.
이제 Task Board에서 작업을 확인하고 담당자를 조정해보세요.
```

---

### 주요 기능

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| Agent 단계별 질문 | Agent가 프로젝트 시작에 필요한 정보를 하나씩 질문한다. | Must |
| 프로젝트 정보 입력 | 아이디어, 기간, 팀원 수, 산출물 목표, 경험 수준을 입력한다. | Must |
| ProjectBrief 생성 | 입력 내용을 바탕으로 프로젝트 요약 초안을 생성한다. | Must |
| 기술스택 추천 결과 표시 | 기술스택 후보와 추천 이유를 카드로 보여준다. | Must |
| MVP/후순위/제외 기능 분류 | 기능 범위를 Agent가 분류하고 사용자가 수정한다. | Must |
| Task 생성 후보 표시 | MVP 기능을 개발 가능한 Task 후보로 분해해 보여준다. | Must |
| Task 승인 플로우 | 사용자가 승인한 Task만 실제 Task Board에 생성한다. | Must |
| 이전 단계 수정 | 이전 답변이나 추천 결과를 수정할 수 있다. | Should |
| 나중에 이어하기 | 설정을 완료하지 않아도 임시 저장 후 이어서 진행할 수 있다. | Should |
| GitHub 연결 유도 | Task 생성 이후 GitHub Repository 연결을 안내한다. | Should |

---

### 수용 조건

- 사용자는 Workspace 최초 진입 시 프로젝트 시작 가이드 화면을 볼 수 있어야 한다.
- 사용자는 Agent 질문에 답하면서 프로젝트 정보를 단계적으로 입력할 수 있어야 한다.
- Agent는 프로젝트 정보를 바탕으로 ProjectBrief 초안을 생성해야 한다.
- Agent는 팀원 경험과 프로젝트 조건을 바탕으로 기술스택 후보를 추천해야 한다.
- 사용자는 추천된 기술스택을 선택하거나 수정할 수 있어야 한다.
- Agent는 프로젝트 기능을 MVP, 후순위, 제외 기능으로 분류해야 한다.
- 사용자는 기능 분류 결과를 수정할 수 있어야 한다.
- Agent는 MVP 기능을 Task 후보로 분해해야 한다.
- 사용자는 Task 후보를 승인, 수정 후 승인, 보류, 제외할 수 있어야 한다.
- 승인된 Task만 실제 Task Board에 생성되어야 한다.
- 설정 중간에 이탈해도 입력 내용은 임시 저장되어야 한다.
- 프로젝트 시작 가이드 완료 후 사용자는 Task Board 또는 Dashboard로 이동할 수 있어야 한다.

## 6.5 Task 화면

### 화면 구성

Task 관리 화면은 Workspace 내 작업을 상태별로 확인하고, 담당자·마감일·GitHub Issue·PR 연결 상태를 한눈에 파악할 수 있는 칸반 보드 형태로 제공한다.

사용자는 Task를 상태별 컬럼에서 확인하고, 드래그 앤 드롭 또는 상세 패널을 통해 상태, 담당자, 마감일, 우선순위, 라벨, GitHub 연결 정보를 수정할 수 있다.

---

### Task 화면 주요 영역

| 영역 | 설명 | 우선순위 |
| --- | --- | --- |
| 상단 헤더 | 현재 Workspace/Channel 이름, Task 화면 제목, Task 생성 버튼, Agent 호출 버튼을 표시한다. | Must |
| 보기 전환 탭 | 칸반 보드, 목록 보기, 일정 보기로 화면을 전환한다. MVP에서는 칸반 보드를 기본 화면으로 제공한다. | Should |
| 필터/정렬 영역 | 담당자, 상태, 우선순위, 라벨, 마감일, GitHub Issue 연결 여부 기준으로 Task를 필터링한다. | Must |
| Task 상태 컬럼 | To Do, In Progress, Review, Done, Blocked 상태별로 Task 카드를 나누어 표시한다. | Must |
| Task 카드 | Task 제목, 담당자, 마감일, 우선순위, 라벨, GitHub Issue/PR 연결 여부를 요약해 보여준다. | Must |
| Task 상세 패널 | Task 카드를 클릭하면 우측 패널에서 상세 정보와 수정 기능을 제공한다. | Must |
| Agent 추천 영역 | Agent가 생성한 Task 후보, 지연 작업, 중복 가능 Task, 다음 행동 제안을 표시한다. | Must |
| GitHub 연결 상태 표시 | Task가 GitHub Issue 또는 PR과 연결되어 있는지 카드와 상세 패널에서 표시한다. | Must |
| 빈 상태 화면 | Task가 없을 때 Agent에게 Task 분해를 요청하거나 직접 Task를 생성할 수 있도록 안내한다. | Must |

---

### 상단 헤더

Task 화면 상단에는 현재 작업 공간과 Task 관리에 필요한 주요 액션을 배치한다.

| 요소 | 설명 |
| --- | --- |
| 화면 제목 | `Task` 또는 `Task Board`로 표시한다. |
| Workspace/Channel 표시 | 사용자가 현재 어느 Workspace 또는 Channel의 Task를 보고 있는지 표시한다. |
| Task 생성 버튼 | 사용자가 직접 Task를 생성할 수 있는 버튼을 제공한다. |
| Agent Task 추천 버튼 | Agent에게 현재 프로젝트 목표나 기능 목록을 바탕으로 Task 후보 생성을 요청한다. |
| GitHub 동기화 버튼 | 연결된 GitHub Issue/PR 상태를 수동으로 동기화한다. |
| 검색창 | Task 제목, 설명, 담당자, Issue 번호 기준으로 검색한다. |

---

### 필터 및 정렬

Task가 많아졌을 때 필요한 작업만 빠르게 찾을 수 있도록 필터와 정렬 기능을 제공한다.

| 기능 | 설명 | 우선순위 |
| --- | --- | --- |
| 담당자 필터 | 특정 팀원이 담당한 Task만 조회한다. | Must |
| 상태 필터 | To Do, In Progress, Review, Done, Blocked 상태별로 조회한다. | Must |
| 우선순위 필터 | Low, Medium, High 기준으로 조회한다. | Should |
| 라벨 필터 | 기획, 개발, 회의, 리뷰, 문서 등 Task 라벨 기준으로 조회한다. | Must |
| 마감일 필터 | 오늘 마감, 이번 주 마감, 지연됨 기준으로 조회한다. | Should |
| GitHub 연결 필터 | Issue 연결됨, Issue 미연결, PR 연결됨 기준으로 조회한다. | Should |
| 정렬 | 마감일 빠른 순, 우선순위 높은 순, 최근 수정 순으로 정렬한다. | Should |

---

### 칸반 보드 컬럼

Task는 상태별 컬럼으로 구분해 표시한다.

| 컬럼 | 설명 |
| --- | --- |
| To Do | 아직 시작하지 않은 작업을 표시한다. |
| In Progress | 현재 진행 중인 작업을 표시한다. |
| Review | 개발은 완료되었지만 리뷰 또는 확인이 필요한 작업을 표시한다. |
| Done | 완료된 작업을 표시한다. |
| Blocked | 진행이 막힌 작업을 별도 컬럼으로 표시한다. |

Blocked는 일반 진행 흐름과 다르게 예외 상태에 가깝기 때문에, 화면에서 시각적으로 구분되도록 표시한다.

---

### Task 카드 구성

각 Task는 카드 형태로 표시하며, 카드 안에는 작업 판단에 필요한 최소 정보를 보여준다.

| 카드 요소 | 설명 | 우선순위 |
| --- | --- | --- |
| Task 제목 | 작업의 핵심 내용을 한 줄로 표시한다. | Must |
| 담당자 | 담당자 이름 또는 프로필 이미지를 표시한다. | Must |
| 마감일 | 마감일을 표시하고, 지연된 경우 별도 표시한다. | Must |
| 우선순위 | Low, Medium, High 중 하나를 표시한다. | Should |
| Task 라벨 | 기획, 개발, 회의, 리뷰, 문서 등 작업 유형을 표시한다. | Must |
| GitHub Issue 상태 | 연결된 Issue 번호 또는 미연결 상태를 표시한다. | Must |
| PR 연결 상태 | 연결된 PR이 있는 경우 PR 번호와 상태를 표시한다. | Should |
| Source 표시 | Manual, Agent, Meeting, GitHub 중 어디서 생성된 Task인지 표시한다. | Should |
| Blocked 사유 | Blocked 상태인 경우 막힌 이유가 있는지 표시한다. | Should |

---

### Task 카드 예시 정보

Task 카드에는 다음과 같은 정보가 표시될 수 있다.

```
로그인 API 구현
담당자: 김은재
상태: In Progress
우선순위: High
라벨: 백엔드
마감일: 07.03
GitHub Issue: #12
연결 PR: 없음
Source: Agent
```

---

### Task 상세 패널

Task 카드를 클릭하면 우측 상세 패널이 열린다. 상세 패널에서는 Task의 전체 정보 확인과 수정이 가능하다.

| 항목 | 설명 | 우선순위 |
| --- | --- | --- |
| Task 제목 | Task 제목을 확인하고 수정한다. | Must |
| 설명 | 작업 배경, 구현 내용, 참고 사항을 확인하고 수정한다. | Must |
| 상태 | To Do, In Progress, Review, Done, Blocked 중 하나로 변경한다. | Must |
| 담당자 | Workspace 멤버 중 담당자를 지정하거나 변경한다. | Must |
| 마감일 | Task 마감일을 설정하거나 변경한다. | Must |
| 우선순위 | Low, Medium, High 중 하나로 설정한다. | Should |
| Task 라벨 | 작업 유형을 선택한다. | Must |
| 완료 조건 | 이 Task가 완료되었다고 판단할 기준을 작성한다. | Must |
| GitHub Issue | 연결된 GitHub Issue를 확인하거나 새 Issue 생성을 요청한다. | Must |
| 관련 PR | 연결된 PR이 있는 경우 PR 상태와 Code Review Room 이동 링크를 표시한다. | Should |
| Source 정보 | Task가 수동 생성, Agent 추천, 회의 Report, GitHub 중 어디서 생성되었는지 표시한다. | Should |
| 관련 Report | 회의에서 생성된 Task인 경우 원본 Report로 이동할 수 있다. | Should |
| 관련 Canvas | Canvas에서 생성되거나 연결된 Task인 경우 Canvas 노드로 이동할 수 있다. | Should |
| 댓글/메모 | Task에 대한 추가 논의나 메모를 작성한다. | Could |
| 변경 이력 | 상태, 담당자, 마감일 변경 이력을 확인한다. | Could |

---

### Task 생성 모달

사용자가 직접 Task를 생성할 때는 입력 부담을 줄이기 위해 필수 정보와 선택 정보를 구분한다.

| 입력 항목 | 필수 여부 | 설명 |
| --- | --- | --- |
| 제목 | 필수 | Task 제목을 입력한다. |
| 설명 | 선택 | 작업 설명을 입력한다. |
| 상태 | 필수 | 기본값은 To Do로 설정한다. |
| 담당자 | 선택 | 생성 시 담당자를 지정할 수 있다. |
| 마감일 | 선택 | 마감일을 설정할 수 있다. |
| 우선순위 | 선택 | 기본값은 Medium으로 설정한다. |
| Task 라벨 | 필수 | 작업 유형을 선택한다. |
| 완료 조건 | 선택 | 완료 판단 기준을 입력한다. |
| GitHub Issue 생성 여부 | 선택 | Task 생성과 동시에 Issue 생성을 요청할 수 있다. |

---

### Agent Task 후보 승인 영역

Agent가 생성한 Task는 즉시 저장하지 않고, 사용자가 검토할 수 있는 후보 카드로 표시한다.

| 요소 | 설명 |
| --- | --- |
| 추천 Task 제목 | Agent가 제안한 Task 이름 |
| 추천 이유 | 이 Task가 필요한 이유 |
| 추천 담당자 | 팀원 경험과 역할을 바탕으로 한 담당자 후보 |
| 추천 마감일 | 마일스톤과 작업 난이도를 고려한 마감일 후보 |
| 완료 조건 | Task 완료 기준 |
| 중복 가능성 | 기존 Task 또는 Issue와 유사한 항목이 있는 경우 표시 |
| 승인 버튼 | 실제 Task로 생성 |
| 수정 후 승인 버튼 | 내용을 수정한 뒤 Task로 생성 |
| 보류 버튼 | 지금 생성하지 않고 추천 목록에 남김 |
| 거절 버튼 | 추천안을 삭제하거나 거절 이력으로 저장 |

Agent 추천 Task는 사용자가 승인해야 실제 Task로 저장된다.

---

### GitHub Issue 연결 UI

Task와 GitHub Issue 연결 상태를 명확히 표시한다.

| 상태 | 화면 표시 |
| --- | --- |
| Issue 미연결 | `Issue 미연결` 표시와 `Issue 생성` 버튼 제공 |
| Issue 연결됨 | `#12 로그인 API 구현`처럼 Issue 번호와 제목 표시 |
| Issue 동기화 필요 | GitHub와 서비스 상태가 다른 경우 동기화 필요 표시 |
| 권한 오류 | GitHub 권한이 없어 Issue를 생성하거나 불러올 수 없음을 표시 |
| PR 연결됨 | 연결된 PR 번호와 상태 표시, Code Review Room 이동 버튼 제공 |

---

### Task 상태 변경 방식

Task 상태는 두 가지 방식으로 변경할 수 있다.

| 방식 | 설명 |
| --- | --- |
| 드래그 앤 드롭 | Task 카드를 다른 상태 컬럼으로 이동해 상태를 변경한다. |
| 상세 패널 수정 | Task 상세 패널에서 상태 값을 직접 변경한다. |

상태 변경 시 GitHub Issue 또는 PR 상태와 충돌이 발생할 수 있는 경우, 사용자에게 확인 카드를 표시한다.

예를 들어 PR이 아직 열려 있는데 Task를 Done으로 옮기는 경우, 다음과 같은 확인 문구를 표시한다.

```
이 Task와 연결된 PR이 아직 Merge되지 않았습니다.
그래도 Task 상태를 Done으로 변경할까요?
```

---

### 빈 상태 화면

Task가 없는 경우 사용자가 다음 행동을 쉽게 선택할 수 있도록 안내한다.

| 상황 | 안내 내용 |
| --- | --- |
| Workspace에 Task가 없음 | “아직 생성된 Task가 없습니다. 직접 만들거나 Agent에게 기능을 Task로 나누도록 요청할 수 있습니다.” |
| 특정 필터 결과가 없음 | “조건에 맞는 Task가 없습니다. 필터를 변경하거나 새 Task를 생성해보세요.” |
| GitHub Issue가 연결되지 않음 | “GitHub Repository를 연결하면 Task를 Issue로 생성할 수 있습니다.” |

---

### Task 라벨

Task 라벨은 작업의 성격을 빠르게 구분하기 위해 사용한다.

| 라벨 | 설명 |
| --- | --- |
| 기획 | 아이디어 정리, 요구사항 정의, 기능 명세 작성 |
| 디자인 | 화면 설계, UI 구성, 프로토타입 작업 |
| 프론트엔드 | 클라이언트 화면 및 사용자 인터랙션 구현 |
| 백엔드 | API, 인증, 서버 로직 구현 |
| DB | 데이터 모델, 스키마, 마이그레이션 작업 |
| 인프라 | 배포, CI/CD, 클라우드, 환경 설정 |
| AI/Agent | Agent 로직, 프롬프트, AI 서버, STT 관련 작업 |
| 회의 | 회의 준비, 회의 후속 작업, 결정사항 정리 |
| 리뷰 | PR 리뷰, 코드 확인, 테스트 검토 |
| 문서 | README, API 명세, 발표 자료, 회의록 정리 |
| 버그 | 오류 수정, 예외 처리, QA 결과 반영 |

---

### Task 화면에서 제공해야 하는 주요 액션

| 액션 | 설명 | 우선순위 |
| --- | --- | --- |
| Task 생성 | 사용자가 직접 Task를 만든다. | Must |
| Agent에게 Task 분해 요청 | 기능 또는 회의 내용을 기반으로 Task 후보를 생성한다. | Must |
| Task 상세 열기 | 카드 클릭 시 상세 패널을 연다. | Must |
| Task 상태 변경 | 드래그 앤 드롭 또는 상세 패널에서 상태를 변경한다. | Must |
| 담당자 변경 | Task 담당자를 지정하거나 변경한다. | Must |
| 마감일 변경 | Task 마감일을 수정한다. | Must |
| GitHub Issue 생성 | Task를 GitHub Issue로 생성한다. | Must |
| GitHub Issue 연결 | 기존 Issue와 Task를 연결한다. | Must |
| Code Review Room 이동 | 연결된 PR이 있는 경우 리뷰 화면으로 이동한다. | Should |
| Canvas에 배치 | Task를 Canvas 컴포넌트로 추가한다. | Should |
| Report 원문 보기 | 회의에서 생성된 Task인 경우 원본 Report로 이동한다. | Should |
| Task 삭제 | 불필요한 Task를 삭제한다. | Should |

---

### 수용 조건

- 사용자는 Task를 칸반 보드 형태로 상태별 조회할 수 있어야 한다.
- 사용자는 Task를 생성, 조회, 수정, 삭제할 수 있어야 한다.
- 사용자는 Task 상태를 To Do, In Progress, Review, Done, Blocked 중 하나로 변경할 수 있어야 한다.
- 사용자는 Task 카드를 드래그 앤 드롭하여 상태를 변경할 수 있어야 한다.
- Task 카드에는 제목, 담당자, 마감일, 라벨, GitHub Issue 연결 여부가 표시되어야 한다.
- Task 상세 패널에서는 설명, 상태, 담당자, 마감일, 우선순위, 라벨, 완료 조건을 확인하고 수정할 수 있어야 한다.
- 사용자는 담당자, 상태, 라벨, 마감일 기준으로 Task를 필터링할 수 있어야 한다.
- Agent가 생성한 Task 후보는 사용자가 승인해야 실제 Task로 저장되어야 한다.
- Task는 GitHub Issue와 연결될 수 있어야 한다.
- 연결된 GitHub Issue 또는 PR이 있는 경우 Task 카드와 상세 패널에서 확인할 수 있어야 한다.
- Task가 회의 Report, Canvas, GitHub에서 생성된 경우 원본 객체로 이동할 수 있어야 한다.
- GitHub 동기화 또는 상태 변경 충돌이 발생하면 사용자에게 확인 또는 오류 안내를 제공해야 한다.

## 6.6 GitHub 연동 화면

- GitHub 계정 연결
- Repository 선택
- Issue 목록
- PR 목록
- 동기화 상태 표시

## 6.6 GitHub 연동 화면

### 화면 목적

사용자가 Workspace와 GitHub Repository를 연결하고, GitHub Issue와 PR을 PILO의 Task, Code Review Room, Canvas, Report 흐름과 연결할 수 있게 한다.

이 화면은 GitHub를 대체하기 위한 화면이 아니다.
초보 개발팀이 GitHub Issue와 PR의 상태를 쉽게 이해하고, 서비스 내부의 Task, 회의 결과, 코드 리뷰 흐름과 연결해서 “지금 어떤 개발 작업이 어디까지 진행됐는지”를 파악할 수 있게 하는 보조 화면이다.

---

## 6.6.1 GitHub 연동 메인 화면

### 화면 목적

현재 Workspace의 GitHub 연결 상태, 연결된 Repository, Issue/PR 동기화 상태를 한 화면에서 확인하고 필요한 연동 작업으로 진입할 수 있게 한다.

### 주요 요소

- GitHub 계정 연결 상태 카드
    - 연결됨 / 연결 필요 / 재연결 필요
    - GitHub 사용자명
    - GitHub 프로필 이미지
    - 연결 일시
    - 권한 상태
    - 토큰 만료 또는 권한 오류 여부
- Repository 연결 상태 카드
    - 연결된 Repository 이름
    - Repository owner
    - Public / Private 여부
    - 기본 브랜치
    - Repository URL
    - 마지막 동기화 시간
    - Repository 변경 버튼
- Issue 동기화 요약
    - 전체 Issue 수
    - Open Issue 수
    - Closed Issue 수
    - Task와 연결된 Issue 수
    - Task와 연결되지 않은 Issue 수
- PR 동기화 요약
    - 전체 PR 수
    - Open PR 수
    - Merged PR 수
    - Closed PR 수
    - Review 필요 PR 수
    - Code Review Room 분석 완료 PR 수
- 동기화 상태 표시
    - 정상
    - 동기화 중
    - 일부 실패
    - 실패
    - 재연결 필요
- 주요 탭
    - Repository
    - Issues
    - Pull Requests
    - Sync Status
- Agent 안내 패널
    - “아직 Repository가 연결되지 않았습니다.”
    - “연결되지 않은 Issue가 있습니다.”
    - “리뷰가 필요한 PR이 있습니다.”
    - “이 PR은 관련 Task가 없습니다.”
    - “이 Issue를 Task와 연결하면 진행 상황 추적이 쉬워집니다.”

### 주요 액션

- GitHub 계정 연결
- GitHub 계정 재연결
- GitHub 연결 해제
- Repository 선택
- Repository 변경
- Issue 목록 보기
- PR 목록 보기
- 수동 동기화 실행
- 동기화 오류 확인
- GitHub 원본 Repository로 이동
- Agent에게 연결 상태 점검 요청

### 권한 규칙

- Workspace Owner
    - GitHub 계정 연결 가능
    - Repository 연결 가능
    - Repository 변경 가능
    - GitHub 연결 해제 가능
    - 전체 Issue/PR 동기화 가능
- Workspace Member
    - 연결된 Repository, Issue, PR 조회 가능
    - Task와 Issue/PR 연결 가능
    - 본인이 담당한 Task 기준으로 Issue 생성 요청 가능
- Workspace Viewer
    - 연결 상태, Issue, PR 조회만 가능
    - Repository 변경, 동기화 실행, 연결 해제 불가

### 상태

- GitHub 미연결 상태
    - GitHub 연결 버튼 노출
    - Repository, Issue, PR 탭 비활성화
    - “GitHub를 연결하면 Task를 Issue로 만들고 PR 리뷰를 불러올 수 있습니다.” 안내 표시
- GitHub 연결됨 / Repository 미선택 상태
    - Repository 선택 버튼 노출
    - Issue, PR 탭 비활성화
- Repository 연결 완료 상태
    - Issue / PR 탭 활성화
    - 마지막 동기화 시간 표시
- 권한 부족 상태
    - “이 Repository에 접근할 권한이 없습니다.” 표시
    - Owner에게 재연결 또는 권한 확인 요청 안내
- 토큰 만료 상태
    - “GitHub 인증이 만료되었습니다.” 표시
    - 재연결 버튼 노출
- 동기화 실패 상태
    - 실패 원인 요약 표시
    - 다시 시도 버튼 노출

---

## 6.6.2 GitHub 계정 연결 화면

### 화면 목적

사용자가 자신의 GitHub 계정을 PILO에 연결하여 Repository, Issue, PR 정보를 가져올 수 있게 한다.

### 주요 요소

- GitHub 연결 안내 문구
- GitHub로 연결 버튼
- 요청 권한 안내
    - Repository 읽기
    - Issue 읽기 / 생성
    - PR 읽기
    - 사용자 기본 정보 읽기
- 연결 후 가능한 기능 안내
    - Repository 선택
    - Task를 GitHub Issue로 생성
    - Issue와 Task 연결
    - PR 목록 불러오기
    - PR을 Code Review Room과 연결
- 보안 안내
    - “PILO는 GitHub 비밀번호를 저장하지 않습니다.”
    - “연결은 언제든 해제할 수 있습니다.”
    - “서비스 내에서 직접 Merge는 수행하지 않습니다.”

### 주요 액션

- GitHub OAuth 또는 GitHub App 설치 시작
- 연결 취소
- 연결 완료 후 Repository 선택 화면으로 이동
- 연결 실패 시 재시도

### 성공 조건

- 사용자가 GitHub 인증을 완료한다.
- PILO가 GitHub 사용자 정보를 저장한다.
- 연결 상태가 `connected`로 변경된다.
- Repository 선택 화면으로 이동한다.

### 실패 조건

- 사용자가 GitHub 인증을 취소한다.
- 필요한 권한이 승인되지 않는다.
- GitHub API 호출이 실패한다.
- 이미 다른 계정으로 연결된 상태에서 중복 연결을 시도한다.

### 예외 처리

- 인증 취소
    - “GitHub 연결이 취소되었습니다.” 표시
- 권한 부족
    - “Repository와 Issue/PR을 불러오기 위해 필요한 권한이 부족합니다.” 표시
- 기존 계정과 충돌
    - “이미 다른 GitHub 계정이 연결되어 있습니다. 연결을 변경하시겠습니까?” 표시
- GitHub API 장애
    - “GitHub 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.” 표시

---

## 6.6.3 Repository 선택 화면

### 화면 목적

사용자가 Workspace에서 사용할 GitHub Repository를 선택하고 연결할 수 있게 한다.

MVP에서는 Workspace당 하나의 Repository 연결을 기본으로 한다.
여러 Repository 연결은 후순위 기능으로 분리한다.

### 주요 요소

- 현재 Workspace 이름
- GitHub 계정 정보
- Repository 검색창
- Repository 목록
- Repository 필터
    - 전체
    - 내 Repository
    - Organization Repository
    - Public
    - Private
- Repository 카드 또는 테이블
    - Repository 이름
    - Owner
    - 설명
    - Public / Private 여부
    - 기본 브랜치
    - 최근 업데이트 시간
    - 접근 가능 여부
    - 이미 연결된 Repository 여부
- 선택한 Repository 미리보기
    - Repository URL
    - 기본 브랜치
    - Issue 활성화 여부
    - PR 접근 가능 여부
- Repository 연결 버튼
- Repository 변경 버튼
- Repository 연결 해제 버튼

### 주요 액션

- Repository 검색
- Repository 필터링
- Repository 선택
- Repository 연결
- Repository 변경
- Repository 연결 해제
- GitHub 원본 Repository 열기
- Repository 목록 새로고침

### 연결 규칙

- Workspace Owner만 Repository를 최초 연결할 수 있다.
- Repository 변경은 Owner만 가능하다.
- Repository 변경 시 기존 Task-Issue-PR 연결이 깨질 수 있으므로 경고 모달을 표시한다.
- 연결된 Repository가 Private인 경우, GitHub 권한이 없는 사용자는 GitHub 원본 링크 접근이 제한될 수 있다.
- PILO 내부에는 동기화된 메타데이터만 표시한다.
- Repository가 변경되면 기존 Issue/PR 연결은 `broken_reference` 상태가 될 수 있다.

### Repository 변경 경고 모달

#### 표시 조건

이미 Repository가 연결된 Workspace에서 다른 Repository를 선택하려고 할 때 표시한다.

#### 주요 문구

“Repository를 변경하면 기존 Task와 연결된 GitHub Issue/PR 참조가 깨질 수 있습니다. 기존 연결 정보는 보관되지만, 새 Repository의 Issue/PR과 자동으로 매칭되지는 않습니다.”

#### 액션

- 변경 계속
- 취소

### 빈 상태

- 접근 가능한 Repository가 없을 때
    - “접근 가능한 Repository가 없습니다.”
    - “GitHub에서 Repository 권한을 확인하거나 새 Repository를 생성해주세요.”
- 검색 결과가 없을 때
    - “검색 결과가 없습니다.”
- GitHub 권한이 부족할 때
    - “Repository 목록을 불러올 권한이 부족합니다.”

---

## 6.6.4 Issue 목록 화면

### 화면 목적

연결된 Repository의 GitHub Issue 목록을 확인하고, PILO Task와 연결하거나 새 Task로 변환할 수 있게 한다.

이 화면의 핵심은 GitHub Issue를 단순히 보여주는 것이 아니라, “이 Issue가 PILO 안에서 어떤 Task와 연결되어 있는지”를 명확히 보여주는 것이다.

### 주요 요소

- Repository 이름
- 마지막 Issue 동기화 시간
- 수동 동기화 버튼
- Issue 검색창
- Issue 필터
    - Open
    - Closed
    - 전체
    - 내 담당
    - 라벨
    - 마일스톤
    - Task 연결됨
    - Task 미연결
- Issue 목록
    - Issue 번호
    - Issue 제목
    - Issue 상태
    - 라벨
    - 담당자
    - 작성자
    - 생성일
    - 최근 수정일
    - 연결된 Task
    - 동기화 상태
    - GitHub 원본 링크
- Issue 상세 패널
    - 제목
    - 본문 요약
    - 상태
    - 라벨
    - 담당자
    - 댓글 수
    - 연결된 Task
    - 연결된 PR
    - 연결된 Report
    - 연결된 Canvas Node
    - GitHub에서 열기 버튼

### 주요 액션

- Issue 목록 새로고침
- Issue 상세 보기
- GitHub 원본 Issue 열기
- 기존 Task와 Issue 연결
- Issue로부터 Task 생성
- Task에서 GitHub Issue 생성
- Issue 연결 해제
- Agent에게 Issue 요약 요청
- Agent에게 Issue를 Task로 쪼개달라고 요청
- 연결되지 않은 Issue만 보기

### Issue와 Task 연결 방식

#### 1. Task에서 GitHub Issue 생성

사용자가 PILO Task 상세 화면 또는 GitHub Issue 목록 화면에서 “GitHub Issue 생성”을 선택하면, 해당 Task 정보를 기반으로 GitHub Issue를 생성한다.

생성 시 포함 정보:

- Issue 제목
- Issue 본문
- 담당자
- 라벨
- Task 링크
- Workspace 이름
- 생성 출처

생성 완료 후 Task에는 다음 정보가 저장된다.

- GitHub Issue ID
- GitHub Issue Number
- GitHub Issue URL
- GitHub Issue State
- GitHub Repository ID
- 마지막 동기화 시간

#### 2. 기존 GitHub Issue를 Task와 연결

사용자가 GitHub에서 이미 만든 Issue를 PILO Task와 연결할 수 있다.

연결 시 사용자는 다음 중 하나를 선택한다.

- 기존 Task에 연결
- 새 Task로 생성
- 연결하지 않고 보기만 하기

#### 3. GitHub Issue로부터 Task 생성

GitHub Issue가 존재하지만 PILO Task가 없는 경우, 사용자는 Issue 내용을 기반으로 새 Task를 만들 수 있다.

생성되는 Task의 기본값:

- Task 제목: Issue 제목
- Task 설명: Issue 본문 요약
- 상태: To Do 또는 In Progress
- 담당자: GitHub Assignee와 PILO 멤버 매핑 결과
- 라벨: Issue Label 기반
- GitHub Issue 연결 정보 포함

### 동기화 규칙

- GitHub Issue 상태가 Open이면 PILO에서는 진행 가능한 작업으로 표시한다.
- GitHub Issue 상태가 Closed이면 PILO에서는 완료 후보로 표시한다.
- MVP에서는 GitHub Issue 상태 변경이 PILO Task 상태를 자동 변경하지 않는다.
- 대신 “이 Issue가 닫혔습니다. 연결된 Task를 Done으로 변경할까요?”라는 Agent 제안을 표시한다.
- Task 제목이나 설명을 수정하더라도 GitHub Issue 원문을 자동 수정하지 않는다.
- Issue 본문 수정은 GitHub 원본에서 수행한다.
- PILO는 Issue의 상태, 제목, URL, 담당자, 라벨, 최근 수정 시간을 동기화한다.

### 상태

- 연결됨
    - 정상적으로 Task와 연결된 Issue
- 미연결
    - GitHub에는 있지만 PILO Task와 연결되지 않은 Issue
- 깨진 참조
    - 이전에 연결되었지만 Repository 변경, Issue 삭제, 권한 문제로 더 이상 접근할 수 없는 Issue
- 동기화 필요
    - GitHub의 최신 상태와 PILO 저장 상태가 다를 가능성이 있는 Issue
- 동기화 실패
    - API 오류 또는 권한 문제로 최신 정보를 가져오지 못한 Issue

### 빈 상태

- Issue가 없을 때
    - “아직 GitHub Issue가 없습니다.”
    - “PILO Task를 GitHub Issue로 만들어 개발 작업을 시작해보세요.”
- 연결된 Task가 없을 때
    - “Task와 연결되지 않은 Issue가 있습니다.”
    - “Issue를 Task와 연결하면 담당자와 마감일을 함께 관리할 수 있습니다.”

---

## 6.6.5 PR 목록 화면

### 화면 목적

연결된 Repository의 Pull Request 목록을 확인하고, 각 PR을 Task, Issue, Code Review Room과 연결할 수 있게 한다.

PR 목록 화면은 단순 PR 목록이 아니라, 초보자가 “이 PR이 어떤 작업을 해결하기 위한 것인지”, “누가 리뷰해야 하는지”, “Code Review Room에서 분석이 끝났는지”를 확인하는 화면이다.

### 주요 요소

- Repository 이름
- 마지막 PR 동기화 시간
- 수동 동기화 버튼
- PR 검색창
- PR 필터
    - Open
    - Merged
    - Closed
    - Draft
    - Review 필요
    - 내 리뷰 필요
    - Task 연결됨
    - Task 미연결
    - Code Review Room 분석 완료
    - Code Review Room 분석 필요
- PR 목록
    - PR 번호
    - PR 제목
    - PR 상태
    - Draft 여부
    - 작성자
    - Reviewers
    - Review 상태
    - Base branch
    - Head branch
    - 변경 파일 수
    - 추가/삭제 라인 수
    - 연결된 Issue
    - 연결된 Task
    - Code Review Room 상태
    - 최근 업데이트 시간
    - GitHub 원본 링크
- PR 상세 패널
    - PR 제목
    - PR 본문 요약
    - 작성자
    - 연결된 Task
    - 연결된 Issue
    - 변경 파일 목록
    - 리뷰어
    - 리뷰 상태
    - 체크 상태
    - Agent 분석 상태
    - Code Review Room 열기 버튼
    - GitHub에서 열기 버튼

### 주요 액션

- PR 목록 새로고침
- PR 상세 보기
- GitHub 원본 PR 열기
- PR을 Task와 연결
- PR을 Issue와 연결
- PR을 Code Review Room에서 열기
- Agent에게 PR 요약 요청
- Agent에게 먼저 봐야 할 파일 추천 요청
- PR 연결 해제
- 연결되지 않은 PR만 보기

### PR과 Task/Issue 연결 방식

#### 1. PR에서 Issue 자동 추정

PR 제목이나 본문에 다음 정보가 포함되어 있으면 연결 후보를 표시한다.

- `#12`
- `Fixes #12`
- `Closes #12`
- `Related to #12`
- GitHub Issue URL
- PILO Task URL

자동으로 확정하지 않고, 사용자에게 연결 후보로 제안한다.

#### 2. PR을 Task에 직접 연결

사용자는 PR 상세 패널에서 연결할 Task를 검색하고 선택할 수 있다.

연결 후 표시 정보:

- 연결된 Task 제목
- Task 담당자
- Task 상태
- 연결된 Issue
- Code Review Room 분석 상태

#### 3. PR을 Issue에 연결

PR이 특정 Issue와 관련되어 있지만 Task가 없는 경우, 먼저 Issue와 연결하고 이후 Task 생성을 제안한다.

### Code Review Room 연결

PR 목록에서 사용자는 “Code Review Room 열기”를 선택할 수 있다.

Code Review Room 진입 전 필요한 정보:

- PR ID
- PR 번호
- Repository ID
- PR 제목
- PR 본문
- 변경 파일 목록
- Diff 정보
- Base branch
- Head branch
- 연결된 Task
- 연결된 Issue

Code Review Room 분석 상태:

- 분석 전
- 분석 중
- 분석 완료
- 분석 실패
- 재분석 필요

### Merge 관련 정책

- MVP에서는 PILO 안에서 직접 Merge하지 않는다.
- Merge가 필요한 경우 GitHub 원본 PR로 이동시킨다.
- PILO는 Merge 가능 여부를 최종 판단하거나 실행하지 않는다.
- Agent는 Merge 전 체크리스트와 리뷰 포인트만 제공한다.
- 사용자가 Merge를 완료하면, 다음 동기화 시 PR 상태가 Merged로 반영된다.

### 상태

- Open
    - 아직 열려 있는 PR
- Draft
    - 초안 상태의 PR
- Review Requested
    - 리뷰가 요청된 PR
- Changes Requested
    - 변경 요청이 있는 PR
- Approved
    - 승인된 PR
- Merged
    - 병합 완료된 PR
- Closed
    - 병합 없이 닫힌 PR
- 연결 필요
    - Task 또는 Issue와 연결되지 않은 PR
- 분석 필요
    - Code Review Room 분석이 아직 생성되지 않은 PR

### 빈 상태

- PR이 없을 때
    - “아직 Pull Request가 없습니다.”
    - “GitHub에서 PR을 만들면 이곳에서 리뷰 흐름을 확인할 수 있습니다.”
- 연결되지 않은 PR만 필터링했는데 결과가 없을 때
    - “모든 PR이 Task 또는 Issue와 연결되어 있습니다.”
- 분석 필요한 PR이 없을 때
    - “Code Review Room 분석이 필요한 PR이 없습니다.”

---

## 6.6.6 동기화 상태 화면

### 화면 목적

GitHub와 PILO 사이의 동기화 상태를 사용자가 이해할 수 있게 보여주고, 오류가 발생했을 때 복구할 수 있게 한다.

### 주요 요소

- 전체 동기화 상태
    - 정상
    - 동기화 중
    - 일부 실패
    - 실패
    - 인증 필요
- 마지막 동기화 시간
- 동기화 대상 Repository
- Issue 동기화 상태
    - 가져온 Issue 수
    - 생성된 연결 수
    - 업데이트된 Issue 수
    - 실패한 Issue 수
- PR 동기화 상태
    - 가져온 PR 수
    - 업데이트된 PR 수
    - 분석 대기 PR 수
    - 실패한 PR 수
- 동기화 로그
    - 발생 시간
    - 대상
    - 이벤트 유형
    - 결과
    - 실패 원인
- 오류 카드
    - 인증 만료
    - Repository 권한 부족
    - GitHub API 제한
    - 삭제된 Repository
    - 삭제된 Issue/PR
    - 네트워크 오류
- 수동 동기화 버튼
- 실패 항목 다시 시도 버튼
- GitHub 재연결 버튼

### 주요 액션

- 전체 동기화 실행
- Issue만 동기화
- PR만 동기화
- 실패 항목 재시도
- GitHub 계정 재연결
- Repository 권한 다시 확인
- 동기화 로그 확인

### 동기화 상태 정의

#### 정상

GitHub 연결, Repository 접근, Issue/PR 동기화가 모두 정상인 상태.

#### 동기화 중

Issue 또는 PR 정보를 GitHub에서 가져오는 중인 상태.
이때 목록 화면에는 기존 데이터를 유지하고, 상단에 “동기화 중” 상태를 표시한다.

#### 일부 실패

Issue 일부 또는 PR 일부를 가져오지 못한 상태.
성공한 데이터는 반영하고, 실패한 항목만 오류로 표시한다.

#### 실패

GitHub 인증, Repository 접근, API 오류 등으로 전체 동기화가 실패한 상태.

#### 인증 필요

GitHub 토큰이 만료되었거나 사용자가 권한을 철회한 상태.

### 오류별 처리

#### GitHub 인증 만료

- 메시지: “GitHub 인증이 만료되었습니다.”
- 액션: GitHub 재연결

#### Repository 접근 권한 없음

- 메시지: “연결된 Repository에 접근할 수 없습니다.”
- 액션: Repository 권한 확인, Repository 변경

#### Repository 삭제 또는 이동

- 메시지: “연결된 Repository를 찾을 수 없습니다.”
- 액션: Repository 다시 선택

#### Issue/PR 삭제

- 메시지: “GitHub 원본을 찾을 수 없습니다.”
- 상태: 깨진 참조
- 액션: 연결 해제 또는 보관

#### GitHub API 제한

- 메시지: “GitHub API 요청 제한으로 일부 정보를 가져오지 못했습니다.”
- 액션: 잠시 후 다시 시도

---

## 6.6.7 GitHub 객체 상세 패널

### 화면 목적

Issue 또는 PR을 클릭했을 때, GitHub 원본 정보와 PILO 내부 연결 정보를 한 번에 확인할 수 있게 한다.

### Issue 상세 패널 주요 요소

- Issue 제목
- Issue 번호
- Issue 상태
- GitHub URL
- 작성자
- 담당자
- 라벨
- 생성일
- 최근 수정일
- 본문 요약
- 연결된 PILO Task
- 연결된 Report
- 연결된 Canvas Node
- 연결된 PR
- 동기화 상태
- 마지막 동기화 시간

### Issue 상세 패널 주요 액션

- GitHub에서 열기
- Task에서 열기
- 기존 Task와 연결
- 새 Task로 생성
- 연결 해제
- Agent에게 Issue 요약 요청
- Agent에게 하위 Task 추천 요청

### PR 상세 패널 주요 요소

- PR 제목
- PR 번호
- PR 상태
- GitHub URL
- 작성자
- Reviewer
- Base branch
- Head branch
- 변경 파일 수
- 추가/삭제 라인 수
- 본문 요약
- 연결된 Task
- 연결된 Issue
- Code Review Room 분석 상태
- 최근 분석 시간
- 동기화 상태

### PR 상세 패널 주요 액션

- GitHub에서 열기
- Code Review Room 열기
- Task와 연결
- Issue와 연결
- Agent에게 PR 요약 요청
- Agent에게 리뷰 순서 추천 요청
- 연결 해제

---

## 6.6.8 Agent 안내 패널

### 화면 목적

GitHub Issue/PR 활용이 익숙하지 않은 초보 팀에게 다음 행동을 제안한다.

### 표시 위치

- GitHub 연동 메인 화면 우측 패널
- Issue 목록 상단 또는 우측 패널
- PR 목록 상단 또는 우측 패널
- 동기화 오류 발생 시 오류 카드 하단

### Agent 제안 예시

- “연결되지 않은 Issue 3개가 있습니다. Task와 연결해볼까요?”
- “이 PR은 연결된 Task가 없습니다. 관련 Task를 찾아 연결하는 것이 좋습니다.”
- “이 PR은 변경 파일이 많습니다. Code Review Room에서 먼저 봐야 할 파일 순서를 확인하세요.”
- “닫힌 Issue와 연결된 Task가 아직 Done이 아닙니다. 상태 변경이 필요한지 확인하세요.”
- “GitHub Repository가 아직 연결되지 않았습니다. 먼저 Repository를 선택해주세요.”
- “PR 리뷰 요청이 왔습니다. 리뷰 포인트를 요약해드릴까요?”

### 주요 액션

- Task 연결 추천
- Issue에서 Task 생성 추천
- PR에서 Code Review Room 생성 추천
- 닫힌 Issue 기반 Task 완료 제안
- PR 리뷰 순서 추천
- 동기화 오류 해결 가이드 제공

---

## 6.6.9 주요 사용자 흐름

### 흐름 1. GitHub 최초 연결

1. 사용자가 GitHub 연동 화면에 진입한다.
2. GitHub 연결 상태가 `미연결`로 표시된다.
3. 사용자가 “GitHub 계정 연결” 버튼을 클릭한다.
4. GitHub 인증 화면으로 이동한다.
5. 사용자가 권한을 승인한다.
6. PILO가 GitHub 사용자 정보를 저장한다.
7. Repository 선택 화면으로 이동한다.
8. 사용자가 Repository를 선택한다.
9. PILO가 Issue/PR 초기 동기화를 실행한다.
10. GitHub 연동 메인 화면에 연결 상태와 요약 정보가 표시된다.

### 흐름 2. Task를 GitHub Issue로 생성

1. 사용자가 PILO Task를 선택한다.
2. “GitHub Issue 생성” 버튼을 클릭한다.
3. Issue 제목과 본문 미리보기를 확인한다.
4. 담당자와 라벨을 확인한다.
5. 생성 버튼을 클릭한다.
6. GitHub Issue가 생성된다.
7. Task에 GitHub Issue 연결 정보가 저장된다.
8. Issue 목록에 새 Issue가 표시된다.

### 흐름 3. 기존 GitHub Issue를 Task와 연결

1. 사용자가 Issue 목록 화면에 진입한다.
2. Task와 연결되지 않은 Issue를 선택한다.
3. “Task와 연결” 버튼을 클릭한다.
4. 기존 Task를 검색한다.
5. 연결할 Task를 선택한다.
6. Issue와 Task가 연결된다.
7. Issue 목록에 연결된 Task가 표시된다.

### 흐름 4. GitHub PR을 Code Review Room에서 열기

1. 사용자가 PR 목록 화면에 진입한다.
2. 리뷰가 필요한 PR을 선택한다.
3. PR 상세 패널에서 “Code Review Room 열기”를 클릭한다.
4. Agent가 PR 정보를 분석한다.
5. 변경 파일, 주요 함수, API 흐름을 기반으로 리뷰 구조를 생성한다.
6. 사용자가 Code Review Room에서 PR을 검토한다.
7. 리뷰 결과는 PR 상세 패널에 반영된다.
8. Merge가 필요한 경우 GitHub 원본 PR로 이동한다.

### 흐름 5. 동기화 오류 복구

1. GitHub 연동 화면에서 동기화 실패 상태가 표시된다.
2. 사용자가 동기화 상태 화면으로 이동한다.
3. 실패 원인을 확인한다.
4. 인증 만료라면 GitHub 재연결을 진행한다.
5. Repository 권한 문제라면 Repository 권한을 확인한다.
6. 일시적 API 오류라면 다시 시도한다.
7. 복구 성공 시 상태가 정상으로 변경된다.

---

## 6.6.10 MVP 포함 범위

### 포함 기능

- GitHub 계정 연결
- Workspace 단위 Repository 1개 연결
- Repository 목록 조회
- Repository 선택
- Issue 목록 조회
- PR 목록 조회
- Task에서 GitHub Issue 생성
- GitHub Issue와 Task 연결
- GitHub Issue 상태 동기화
- PR과 Task 연결
- PR과 Issue 연결
- PR을 Code Review Room으로 열기
- GitHub 원본 링크 이동
- 수동 동기화
- 마지막 동기화 시간 표시
- 기본 오류 상태 표시
- Agent의 연결 추천 및 리뷰 안내

### 제외 기능

- Workspace당 여러 Repository 연결
- GitHub Projects 동기화
- GitHub Milestone 고급 관리
- GitHub Label 양방향 자동 동기화
- GitHub Issue 본문 자동 수정
- GitHub PR 본문 자동 수정
- 서비스 내 직접 Merge
- 서비스 내 PR 승인/리뷰 코멘트 작성
- GitHub Actions 상세 로그 분석
- Branch 생성
- Commit 단위 상세 분석
- Organization 전체 관리 기능
- 복잡한 권한 정책
- 실시간 양방향 동기화

---

## 6.6.11 완료 기준

- 사용자는 GitHub 계정을 연결할 수 있다.
- 사용자는 Workspace에 Repository를 연결할 수 있다.
- 사용자는 연결된 Repository의 Issue 목록을 볼 수 있다.
- 사용자는 연결된 Repository의 PR 목록을 볼 수 있다.
- 사용자는 PILO Task를 GitHub Issue로 생성할 수 있다.
- 사용자는 기존 GitHub Issue를 PILO Task와 연결할 수 있다.
- 사용자는 PR을 Task 또는 Issue와 연결할 수 있다.
- 사용자는 PR을 Code Review Room에서 열 수 있다.
- 사용자는 GitHub 원본 Issue/PR로 이동할 수 있다.
- 사용자는 마지막 동기화 시간을 확인할 수 있다.
- 사용자는 동기화 실패 원인을 확인할 수 있다.
- GitHub 인증이 만료되면 재연결 안내가 표시된다.
- Repository 권한이 없으면 권한 오류 상태가 표시된다.
- 서비스 내 직접 Merge 기능은 제공하지 않는다.

## 6.7.1 Canvas Board 목록 / 생성 화면

### 화면 목적

사용자가 현재 Workspace 안에 있는 Canvas Board를 확인하고, 새 Canvas Board를 생성하거나 기존 Board로 진입할 수 있게 한다.

### 주요 요소

- 현재 Workspace 이름
- Canvas Board 목록
- Canvas Board 이름
- Canvas Board 설명 또는 유형
- 최근 수정 시간
- 생성자 또는 마지막 수정자
- 새 Canvas Board 생성 버튼
- Canvas Board가 없을 때의 빈 상태 화면

### 주요 액션

- Canvas Board 생성
- Canvas Board 선택
- Canvas Board 상세 화면으로 이동
- Canvas Board 삭제 또는 보관
    - Owner 권한 우선

## 6.7.2 Canvas Board 상세 화면

### 화면 목적

사용자가 Workspace의 프로젝트 맥락을 하나의 보드 위에 올려놓고, 노드와 연결선을 통해 회의, Task, GitHub Issue/PR, Report, 파일, 코드, 결정 사항, 리스크를 시각적으로 정리할 수 있게 한다.

### 주요 요소

- Canvas Board 제목
- 저장 상태 표시
    - 저장 중
    - 저장 완료
    - 저장 실패
- 무한 Canvas 영역
- 보드 이동 / 확대 / 축소
- Canvas 전용 객체
    - Memo
    - Drawing
    - Frame
    - Code Block
    - Vote
- 외부 객체 노드
    - Task
    - Report
    - Issue
    - PR
    - File
    - Code Reference
- 맥락 노드
    - Decision
    - Risk
- 연결선
- 노드 위치 / 크기 조정
- 노드 상세 패널
- 원본 화면 이동 액션
- 관련 액션 시작
    - Task 생성
    - Issue 생성
    - Report 열기
    - PR 리뷰 보기
- Agent 관계 / 배치 제안 패널
- 필터 / 검색 패널
- 권한 없음 상태
- 깨진 참조 상태

## 6.8 회의 Report 화면

### 화면 목적

사용자가 회의 시작부터 종료까지 기록된 메모, 채팅, Canvas 작업, Task 변경, GitHub Issue/PR 맥락, transcript를 확인하고, Agent가 생성한 회의 Report 초안을 검토·수정·확정할 수 있게 한다.

회의에서 나온 논의, 결정사항, 보류 질문, 리스크, 후속 작업을 구조화하여 저장하고, 후속 작업은 사용자의 확인을 거쳐 실제 Task 및 GitHub Issue로 연결한다.

### 주요 요소

- 회의 기본 정보
    - 회의 제목
    - 회의 목적
    - 회의 상태
        - 예정
        - 진행 중
        - 종료
        - Report 생성 완료
    - 회의 시작 시각
    - 회의 종료 시각
    - 회의 진행 시간
    - 회의 생성자
    - 연결된 Workspace
    - 연결된 Canvas Board
- 회의 참석자 영역
    - 참석자 목록
- 회의록 페이지 버튼
    - 회의록들의 목록이 나열
    - 각 회의록 수정, 삭제 가능
- Report 문서 구성
    - Report 본문 영역
        - 회의 요약
        - 주요 논의
        - 결정사항
        - 보류사항 / 미해결 질문
        - 리스크
        - 후속 작업
        - 생성된 Task
        - 연결된 GitHub Issue
        - 연결된 GitHub PR
        - 다음 회의 안건
    - 결정사항 영역
        - 결정 내용
        - 결정 상태
            - 결정됨
            - 보류
            - 재논의 필요
        - 관련 Task
        - 관련 PR
        - 관련 Canvas 노드
        - 결정사항 수정
        - 결정사항 삭제
    - 후속 작업 영역
        - Action Item 목록
        - 작업 제목
        - 작업 설명
        - 추천 담당자
        - 추천 마감일
        - 우선순위
        - 관련 결정사항
        - 관련 Issue/PR
        - 상태
            - 초안
            - 승인됨
            - Task 전환 완료
            - 거절됨
        - Task로 전환 액션
        - 전환된 Task로 이동
- Agent Report 생성 영역
    - Report 생성 버튼
    - 생성 실패 상태
    - 생성 실패 사유
    - 사용된 입력 데이터 요약
    - Agent 분석 근거 표시
- Task 전환 패널
    - 후속 작업 선택
    - Task 제목 수정
    - Task 설명 수정
    - 담당자 선택
    - 마감일 선택
    - 우선순위 선택
    - 관련 Report 자동 연결
    - 사용자 확인
    - Task 생성 성공 상태
    - Task 생성 실패 상태
- GitHub Issue 연결 패널
    - 개발 태그가 붙은 Task 표시
    - 기존 Issue 연결
    - 새 Issue 생성 요청
    - Repository 선택
    - Issue 제목 / 본문 미리보기
    - 사용자 확인
    - 연결된 Issue로 이동

### 주요 요소

- Report 제목
- 회의 기본 정보
    - 회의 이름
    - 회의 일시
    - 회의 진행 시간
    - 참여자 목록
    - 연결된 Workspace
    - 연결된 Canvas Board
- Report 생성 상태 표시
    - 생성 중
    - 생성 완료
    - 생성 실패
    - 수정됨
    - 저장 완료
- 회의 요약 영역
    - 전체 회의 내용 요약
    - Agent 생성 요약
    - 사용자 직접 수정
- 주요 논의 영역
    - 논의 주제 목록
    - 주제별 상세 내용
    - 관련 발언 / 메모 / Canvas 참조
- 결정사항 영역
    - 최종 결정된 내용
    - 결정 근거
    - 관련 Canvas 노드
    - 관련 Task
    - 관련 GitHub Issue/PR
- 후속 작업 영역
    - Agent가 추출한 Action Item 목록
    - Task 생성 후보
    - 담당자 지정
    - 마감일 지정
    - 우선순위 지정
    - 개발 태그 지정
    - Task 생성 액션
- 생성된 Task 목록
    - 회의에서 생성된 Task
    - 기존 Task와 연결된 항목
    - Task 상태
    - 담당자
    - 원본 Task 상세 화면 이동
- GitHub 연결 영역
    - 회의에서 언급된 Issue
    - 회의에서 언급된 PR
    - 개발 태그가 붙은 Task의 Issue 생성 / 연결 액션
    - GitHub 원본 이동
- 다음 회의 안건 영역
    - 다음 회의에서 다룰 주제
    - 미해결 논의
    - 보류된 결정사항
- 회의 원본 데이터 패널
    - 음성 transcript
    - 회의 메모
    - 회의 중 Canvas 변경 내역
    - 회의 중 Task 생성 / 수정 / 삭제 내역
    - 회의 중 Agent 채팅 내역
- 근거 확인 기능
    - Report 항목별 원본 transcript 확인
    - 관련 메모 확인
    - 관련 Canvas 노드로 이동
    - 관련 Task / Issue / PR로 이동
- Report 편집 기능
    - 섹션별 내용 수정
    - 항목 삭제
    - 항목 추가
    - 순서 변경
- Report 저장 액션
- Task 전환 액션
- GitHub Issue 연결 액션
- Report 공유 / 조회 액션
- Report 생성 실패 상태
- 원본 데이터 없음 상태
- 권한 없음 상태
- 깨진 참조 상태

## 6.9 Code Review Room 화면

- PR 목록
- PR 요약
- 변경 흐름 노드 그래프
- 노드 상세 패널
- diff viewer
- 리뷰 판단 버튼
- 전체 리뷰 결과
- Merge 전 체크리스트

## 6.10 채팅 화면

### 화면 목적

사용자가 Workspace 맥락 안에서 Agent에게 메시지를 보내고, 대화 내용을 기반으로 Task 생성, Report 반영, PR 분석, Issue 분해 등의 작업을 요청할 수 있게 한다.

MVP에서는 일반 팀 채팅방이 아니라 Agent 호출 중심의 챗봇형 채팅창으로 제공한다.

### 주요 요소

- 채팅창 제목
    - Agent Chat
    - 현재 Workspace명
- Agent 상태 표시
    - 대기 중
    - 응답 생성 중
    - 작업 제안 생성 중
    - 오류 발생
- 메시지 목록
    - 사용자 메시지
    - Agent 응답 메시지
    - 시스템 안내 메시지
    - 날짜 / 시간 구분
    - 이전 메시지 조회
- 메시지 입력 영역
    - 텍스트 입력창
    - 전송 버튼
    - Enter 전송
    - Shift + Enter 줄바꿈
    - 입력 비활성 상태
- @Agent 호출
    - `@Agent` 명령 감지
    - Agent 호출 자동완성
    - 추천 명령 표시
    - 잘못된 명령 안내
- Agent 호출 예시
    - Task 생성 요청
    - 회의록 반영 요청
    - Issue 분해 요청
    - PR 분석 요청
    - 우선 확인 파일 추천 요청
- Agent 응답 카드
    - Task 후보 카드
    - Report 반영 후보 카드
    - Issue 후보 카드
    - PR 분석 요약 카드
    - 파일 추천 카드
- 사용자 승인 액션
    - 저장
    - 수정 후 저장
    - 취소
    - 다시 생성
- 메시지 기반 Task 생성
    - 메시지에서 할 일 추출
    - 담당자 / 마감일 / 우선순위 제안
    - Task 생성 전 미리보기
- 메시지 기반 Report 반영
    - 결정 사항 추출
    - 논의 요약 추출
    - 액션 아이템 추출
    - Report 반영 전 미리보기
- 메시지 기반 PR 분석
    - 먼저 봐야 할 파일 추천
    - 변경 범위 요약
    - 리뷰 포인트 제안
- 저장 상태 표시
    - 저장 중
    - 저장 완료
    - 저장 실패
- 빈 상태
    - 아직 대화가 없는 상태
    - Agent 호출 예시 제공
- 로딩 상태
    - 이전 메시지 불러오는 중
    - Agent 응답 생성 중
- 오류 상태
    - 메시지 전송 실패
    - Agent 응답 실패
    - 결과 저장 실패
- 권한 없음 상태
    - Workspace 접근 권한 없음
    - Agent 사용 권한 없음
- MVP 제외 요소
    - Workspace 단위 팀 채팅방
    - 사용자 간 실시간 채팅
    - 파일 첨부
    - 이모지 / 리액션
    - 메시지 스레드
    - 읽음 표시

## 6.11 알림 화면

### 화면 목적

사용자가 자신과 관련된 Task, GitHub Issue/PR, 회의 Report, 코드 리뷰, Agent 확인 요청을 한 곳에서 확인하고, 읽음/안 읽음 상태를 관리하며, 알림과 연결된 작업 화면으로 바로 이동할 수 있게 한다.

알림 화면은 사용자가 놓치면 안 되는 작업 변화와 확인 요청을 모아 보여주는 개인 작업 진입점 역할을 한다.

### 주요 요소

- 알림 목록
    - 최신순 알림 표시
    - 읽지 않은 알림 우선 표시
    - 알림 제목
    - 관련 객체 정보
    - 알림 본문 요약
- 알림 상태
    - 안 읽음
    - 읽음
    - 처리 완료
- 알림 유형
    - Task 담당자 지정
    - 채팅 멘션
- 알림 카드
    - 알림 아이콘
    - 알림 제목
    - 알림 설명
    - 발생 시간
    - 읽음/안 읽음 표시
    - 관련 객체 이름
    - 관련 화면 이동 버튼
    - 읽음 처리 버튼
    - 중요한 알림 강조 표시
- 읽음 / 안 읽음 관리
    - 개별 알림 읽음 처리
    - 전체 읽음 처리
    - 안 읽은 알림 개수 표시
    - 읽은 알림 흐리게 표시
    - 읽지 않은 알림 배지 표시
- 필터 / 탭
    - 전체
    - 안 읽음
    - Task
    - GitHub
    - 회의 Report
    - Code Review
    - Agent
    - 시스템
- 관련 작업 이동
    - Task 알림 클릭 시 Task 상세로 이동
    - Issue 알림 클릭 시 연결된 Issue 또는 Task-Issue 화면으로 이동
    - PR 알림 클릭 시 PR 상세 또는 Code Review Room으로 이동
    - 회의 Report 알림 클릭 시 Report 상세로 이동
    - Agent 확인 요청 클릭 시 확인 카드 또는 Agent Action 화면으로 이동
    - 프로젝트 계획 알림 클릭 시 Planning Draft 화면으로 이동
- Agent 확인 요청 영역
    - Task 생성 확인
    - Issue 생성 확인
    - 담당자 변경 확인
    - 마감일 변경 확인
    - Report 확정 확인
    - 승인 / 거절 버튼
    - 확인 전에는 실제 변경이 실행되지 않음
- 알림 상세 패널
    - 알림 전체 내용
    - 발생 원인
    - 관련 객체 링크
    - 관련 사용자
    - 생성 시각
    - 읽음 처리 시각
    - 처리 상태
    - 원본 화면 이동 액션
- 상단 요약
    - 안 읽은 알림 수
    - 처리 필요한 알림 수
    - 오늘 발생한 알림 수
    - 최근 Agent 확인 요청 수

---

# 7. 충돌 방지형 핵심 데이터 모델

이 모델은 같은 사실을 두 테이블에 중복 저장하지 않는 것을 기본 원칙으로 한다.

특히 다음 충돌을 제거한다.

- Workspace 소유자는 `Workspace.ownerId`에 따로 저장하지 않고 `WorkspaceMember.role = Owner`만 신뢰한다.
- Task와 GitHub Issue/PR은 서로 FK를 들고 있지 않고 `TaskExternalLink`로 연결한다.
- Canvas 노드는 원본 엔티티를 `sourceType/sourceId` 다형 필드로 직접 참조하지 않고 `CanvasNodeLink`로 연결한다.
- 초대 상태와 멤버 상태를 섞지 않는다. 초대는 `WorkspaceInvite`, 실제 참여자는 `WorkspaceMember`가 담당한다.
- 사용자 작성자 정보는 가능한 한 `workspaceMemberId`를 사용해 Workspace 권한과 감사 이력을 일관되게 유지한다.
- 외부 서비스 데이터는 외부 고유키를 기준으로 idempotent upsert가 가능해야 한다.

## 7.1 공통 규칙

| 규칙 | 내용 |
| --- | --- |
| ID | 모든 내부 ID는 UUID 또는 CUID 같은 전역 고유 ID를 사용한다. |
| Workspace 범위 | Workspace 내부 데이터는 반드시 `workspaceId`를 가진다. |
| 작성자 | Workspace 내부 데이터의 작성자는 `createdByMemberId`로 기록한다. |
| Soft delete | 사용자가 복구하거나 감사해야 하는 데이터는 `deletedAt`으로 삭제 상태를 표현한다. |
| 외부 동기화 | GitHub처럼 외부 원본이 있는 데이터는 외부 고유키에 unique constraint를 둔다. |
| 중복 방지 | 같은 관계를 양쪽 테이블에 동시에 저장하지 않는다. 관계는 별도 link 테이블을 둔다. |
| 정합성 | `workspaceMemberId`를 참조하는 행은 같은 `workspaceId` 안의 멤버만 참조할 수 있어야 한다. |

## 7.2 User

| 필드 | 설명 |
| --- | --- |
| id | 사용자 ID |
| primaryEmail | 대표 이메일. 로그인 식별의 단일 기준으로 사용하지 않는다. |
| displayName | 표시 이름 |
| profileImageUrl | 프로필 이미지 URL |
| status | Active, Deleted |
| lastLoginAt | 마지막 로그인 시간 |
| createdAt | 생성일 |
| updatedAt | 수정일 |
| deletedAt | 삭제일 |

제약 조건:

- `id`는 primary key다.
- `primaryEmail`은 nullable이다. OAuth 제공자 이메일이 없거나 검증되지 않을 수 있다.
- 이메일 동일성만으로 서로 다른 OAuth 계정을 자동 병합하지 않는다.

## 7.3 UserIdentity

| 필드 | 설명 |
| --- | --- |
| id | OAuth 계정 연결 ID |
| userId | 사용자 ID |
| provider | Google, GitHub |
| providerUserId | OAuth 제공자의 사용자 고유 ID |
| email | OAuth 제공자로부터 받은 이메일 |
| emailVerified | OAuth 제공자가 이메일 검증 여부를 제공한 경우의 값 |
| displayName | OAuth 제공자로부터 받은 이름 |
| profileImageUrl | OAuth 제공자로부터 받은 프로필 이미지 URL |
| connectedAt | 계정 연결일 |
| lastLoginAt | 해당 OAuth 계정으로 마지막 로그인한 시간 |
| createdAt | 생성일 |
| updatedAt | 수정일 |

제약 조건:

- `(provider, providerUserId)`는 unique다.
- 하나의 User는 여러 UserIdentity를 가질 수 있다.
- 서로 다른 provider의 동일 이메일은 같은 사용자라는 보장이 없으므로 자동으로 합치지 않는다.

## 7.4 AuthSession

| 필드 | 설명 |
| --- | --- |
| id | 세션 ID |
| userId | 사용자 ID |
| tokenHash | 세션 토큰 해시값 |
| expiresAt | 만료 시간 |
| revokedAt | 로그아웃 또는 강제 만료 시간 |
| createdAt | 생성일 |
| updatedAt | 수정일 |

제약 조건:

- `tokenHash`는 unique다.
- 유효 세션 조건은 `revokedAt is null`이고 `expiresAt > now()`이다.

## 7.5 Workspace

| 필드 | 설명 |
| --- | --- |
| id | Workspace ID |
| name | Workspace 이름 |
| description | 설명 |
| type | side_project, bootcamp, university, hackathon, other |
| status | Active, Archived |
| createdAt | 생성일 |
| updatedAt | 수정일 |
| archivedAt | 보관일 |
| deletedAt | 삭제일 |

제약 조건:

- Workspace의 Owner는 `WorkspaceMember`에서만 판단한다.
- Workspace 생성 시 같은 트랜잭션 안에서 생성자를 `WorkspaceMember(role = Owner)`로 추가한다.
- 활성 Workspace에는 최소 1명의 Active Owner가 있어야 한다.

## 7.6 WorkspaceMember

| 필드 | 설명 |
| --- | --- |
| id | 멤버 ID |
| workspaceId | Workspace ID |
| userId | 사용자 ID |
| role | Owner, Member |
| status | Active, Removed |
| joinedAt | 참여일 |
| removedAt | 제거일 |
| lastAccessedAt | 마지막으로 해당 Workspace에 접근한 시간 |
| createdAt | 생성일 |
| updatedAt | 수정일 |

제약 조건:

- `(workspaceId, userId)`는 unique다.
- 초대 중인 사용자는 WorkspaceMember에 만들지 않는다.
- 멤버가 다시 참여하면 기존 row를 재활성화하거나 새 row를 만들지 중 하나를 선택해야 한다. MVP에서는 기존 row 재활성화를 기본으로 한다.

## 7.7 WorkspaceInvite

| 필드 | 설명 |
| --- | --- |
| id | 초대 ID |
| workspaceId | Workspace ID |
| tokenHash | 초대 링크 토큰 해시값 |
| role | 수락 시 부여할 기본 역할 |
| invitedEmail | 이메일 초대 시 대상 이메일. 링크 초대만 쓰면 nullable |
| invitedByMemberId | 초대한 WorkspaceMember ID |
| status | Pending, Accepted, Revoked, Expired |
| expiresAt | 초대 만료 시간 |
| acceptedByMemberId | 초대를 수락해 생성 또는 재활성화된 WorkspaceMember ID |
| acceptedAt | 초대 수락 시간 |
| createdAt | 생성일 |
| updatedAt | 수정일 |

제약 조건:

- `tokenHash`는 unique다.
- `acceptedByMemberId`는 Accepted 상태에서만 존재한다.
- 초대 수락은 WorkspaceMember 생성 또는 재활성화와 같은 트랜잭션에서 처리한다.

## 7.8 ProjectProfile

| 필드 | 설명 |
| --- | --- |
| id | 프로젝트 정보 ID |
| workspaceId | Workspace ID |
| goal | 프로젝트 목표 |
| startDate | 프로젝트 시작일 |
| endDate | 프로젝트 종료 예정일 |
| teamSize | 팀원 수 |
| experienceLevel | 팀원 경험 수준 |
| selectedTechStack | 선택 기술스택 |
| constraints | 제약 조건 |
| createdByMemberId | 생성자 WorkspaceMember ID |
| createdAt | 생성일 |
| updatedAt | 수정일 |

제약 조건:

- `workspaceId`는 unique다. 한 Workspace의 현재 프로젝트 프로필은 하나만 둔다.
- 변경 이력이 필요하면 별도 `ProjectProfileRevision`을 추가한다.

## 7.9 Task

| 필드 | 설명 |
| --- | --- |
| id | Task ID |
| workspaceId | Workspace ID |
| title | 제목 |
| description | 설명 |
| status | Todo, InProgress, Review, Done, Blocked, Canceled |
| priority | Low, Medium, High |
| assigneeMemberId | 담당 WorkspaceMember ID |
| dueDate | 마감일 |
| createdByMemberId | 생성자 WorkspaceMember ID |
| source | Manual, Agent, MeetingReport, Github |
| createdAt | 생성일 |
| updatedAt | 수정일 |
| deletedAt | 삭제일 |

제약 조건:

- `assigneeMemberId`는 nullable이다.
- Task와 GitHub Issue/PR의 연결은 `TaskExternalLink`에만 저장한다.
- 같은 Workspace 안에서 제목 중복을 DB가 막지는 않는다. 중복 추천 방지는 Agent/검색 레이어에서 처리한다.

## 7.10 GithubRepository

| 필드 | 설명 |
| --- | --- |
| id | Repository 연결 ID |
| workspaceId | Workspace ID |
| githubRepositoryId | GitHub Repository ID |
| ownerLogin | Repository Owner |
| name | Repository 이름 |
| fullName | owner/name |
| defaultBranch | 기본 브랜치 |
| url | Repository URL |
| connectedByMemberId | 연결한 WorkspaceMember ID |
| connectedAt | 연결일 |
| syncedAt | 마지막 동기화 시간 |
| deletedAt | 연결 해제일 |

제약 조건:

- `(workspaceId, githubRepositoryId)`는 unique다.
- `(workspaceId, fullName)`도 unique로 둘 수 있다.

## 7.11 GithubIssue

| 필드 | 설명 |
| --- | --- |
| id | 내부 Issue ID |
| repositoryId | 연결된 Repository ID |
| githubIssueId | GitHub Issue node/database ID |
| number | GitHub Issue 번호 |
| title | 제목 |
| body | 본문 |
| state | Open, Closed |
| authorLogin | 작성자 GitHub login |
| url | GitHub URL |
| syncedAt | 마지막 동기화 시간 |
| createdAt | 내부 생성일 |
| updatedAt | 내부 수정일 |

제약 조건:

- `(repositoryId, number)`는 unique다.
- `githubIssueId`가 제공되면 unique다.
- Workspace 범위는 `GithubRepository.workspaceId`를 통해 결정한다. 같은 값을 `GithubIssue.workspaceId`에 중복 저장하지 않는다.

## 7.12 GithubPullRequest

| 필드 | 설명 |
| --- | --- |
| id | 내부 PR ID |
| repositoryId | 연결된 Repository ID |
| githubPullRequestId | GitHub PR node/database ID |
| number | GitHub PR 번호 |
| title | 제목 |
| body | 설명 |
| authorLogin | 작성자 GitHub login |
| state | Open, Closed, Merged |
| baseBranch | 대상 브랜치 |
| headBranch | 작업 브랜치 |
| url | GitHub URL |
| syncedAt | 마지막 동기화 시간 |
| createdAt | 내부 생성일 |
| updatedAt | 내부 수정일 |

제약 조건:

- `(repositoryId, number)`는 unique다.
- Task와 PR의 연결은 `TaskExternalLink`에만 저장한다.

## 7.13 TaskExternalLink

| 필드 | 설명 |
| --- | --- |
| id | 연결 ID |
| workspaceId | Workspace ID |
| taskId | Task ID |
| targetType | GithubIssue, GithubPullRequest, MeetingReport, CanvasNode |
| githubIssueId | targetType이 GithubIssue일 때 대상 ID |
| githubPullRequestId | targetType이 GithubPullRequest일 때 대상 ID |
| meetingReportId | targetType이 MeetingReport일 때 대상 ID |
| canvasNodeId | targetType이 CanvasNode일 때 대상 ID |
| relation | created_from, implements, references, blocks, reviewed_by |
| createdByMemberId | 연결 생성자 WorkspaceMember ID |
| createdAt | 생성일 |

제약 조건:

- 하나의 row에는 target ID 중 하나만 채운다.
- `(taskId, targetType, targetId, relation)`은 unique다.
- Task, Issue, PR 테이블에 서로를 가리키는 FK를 추가하지 않는다.

## 7.14 Meeting

| 필드 | 설명 |
| --- | --- |
| id | 회의 ID |
| workspaceId | Workspace ID |
| title | 회의 제목 |
| startedAt | 회의 시작 시간 |
| endedAt | 회의 종료 시간 |
| createdByMemberId | 생성자 WorkspaceMember ID |
| createdAt | 생성일 |
| updatedAt | 수정일 |

## 7.15 MeetingReport

| 필드 | 설명 |
| --- | --- |
| id | Report ID |
| workspaceId | Workspace ID |
| meetingId | 원본 회의 ID |
| title | 제목 |
| summary | 회의 요약 |
| status | Draft, Published, Archived |
| createdByMemberId | 생성자 WorkspaceMember ID |
| createdAt | 생성일 |
| updatedAt | 수정일 |

제약 조건:

- Report 본문 구조는 `MeetingReportItem`으로 분리한다.
- Report에서 생성된 Task는 `TaskExternalLink(targetType = MeetingReport)`로 연결한다.

## 7.16 MeetingReportItem

| 필드 | 설명 |
| --- | --- |
| id | Report 항목 ID |
| reportId | Report ID |
| type | Discussion, Decision, ActionItem, NextAgenda |
| title | 항목 제목 |
| content | 항목 내용 |
| orderIndex | Report 안 표시 순서 |
| createdAt | 생성일 |
| updatedAt | 수정일 |

제약 조건:

- `(reportId, orderIndex)`는 unique다.
- ActionItem이 실제 Task가 되면 Task에 내용을 복사하지 않고 `TaskExternalLink`로 원본 Report와 연결한다.

## 7.17 CanvasBoard

| 필드 | 설명 |
| --- | --- |
| id | Canvas Board ID |
| workspaceId | Workspace ID |
| title | Canvas Board 이름 |
| description | 설명 |
| type | ProjectMap, Meeting, Review, Custom |
| status | Active, Archived |
| createdByMemberId | 생성자 WorkspaceMember ID |
| createdAt | 생성일 |
| updatedAt | 수정일 |
| archivedAt | 보관일 |
| deletedAt | 삭제일 |

## 7.18 CanvasNode

| 필드 | 설명 |
| --- | --- |
| id | 노드 ID |
| canvasBoardId | Canvas Board ID |
| nodeType | Memo, Drawing, Frame, CodeBlock, Vote, EntityRef |
| title | 노드 제목 |
| content | Canvas 전용 노드 내용 |
| x | X 좌표 |
| y | Y 좌표 |
| width | 너비 |
| height | 높이 |
| zIndex | 보드 위 표시 순서 |
| style | 색상, 테두리, 배경 등 표시 설정 |
| createdByMemberId | 생성자 WorkspaceMember ID |
| createdAt | 생성일 |
| updatedAt | 수정일 |
| deletedAt | 삭제일 |

제약 조건:

- Task, Report, Issue, PR 같은 원본 연결 정보는 CanvasNode에 직접 넣지 않는다.
- 원본 연결은 `CanvasNodeLink`에만 저장한다.

## 7.19 CanvasNodeLink

| 필드 | 설명 |
| --- | --- |
| id | 노드 원본 연결 ID |
| canvasNodeId | Canvas Node ID |
| targetType | Task, MeetingReport, GithubIssue, GithubPullRequest, ReviewSession |
| taskId | targetType이 Task일 때 대상 ID |
| meetingReportId | targetType이 MeetingReport일 때 대상 ID |
| githubIssueId | targetType이 GithubIssue일 때 대상 ID |
| githubPullRequestId | targetType이 GithubPullRequest일 때 대상 ID |
| reviewSessionId | targetType이 ReviewSession일 때 대상 ID |
| createdAt | 생성일 |

제약 조건:

- 하나의 row에는 target ID 중 하나만 채운다.
- `(canvasNodeId, targetType, targetId)`는 unique다.
- 같은 원본을 여러 보드에 배치하려면 보드마다 CanvasNode를 따로 만들고 CanvasNodeLink로 같은 원본을 연결한다.

## 7.20 CanvasEdge

| 필드 | 설명 |
| --- | --- |
| id | 연결선 ID |
| canvasBoardId | Canvas Board ID |
| sourceNodeId | 시작 노드 ID |
| targetNodeId | 대상 노드 ID |
| type | related_to, depends_on, blocks, implements, linked_issue, reviewed_by, risk_for, decision_for, references |
| label | 연결 설명 |
| style | 선 색상, 굵기, 화살표 등 표시 설정 |
| createdByMemberId | 생성자 WorkspaceMember ID |
| createdAt | 생성일 |
| updatedAt | 수정일 |

제약 조건:

- `sourceNodeId`와 `targetNodeId`는 같은 `canvasBoardId`에 속해야 한다.
- 자기 자신을 향하는 edge는 허용하지 않는다.

## 7.21 ReviewSession

| 필드 | 설명 |
| --- | --- |
| id | 리뷰 세션 ID |
| workspaceId | Workspace ID |
| pullRequestId | PR ID |
| summary | Agent PR 요약 |
| checklist | Merge 전 체크리스트 |
| finalResult | Passed, NeedsDiscussion, Blocked, Unknown |
| createdByMemberId | 생성자 WorkspaceMember ID |
| createdAt | 생성일 |
| updatedAt | 수정일 |

제약 조건:

- `pullRequestId`는 필수다.
- 같은 PR에 여러 ReviewSession을 만들 수 있다. 최신 리뷰는 `createdAt` 또는 별도 상태로 판단한다.

## 7.22 ReviewNode

| 필드 | 설명 |
| --- | --- |
| id | 리뷰 노드 ID |
| reviewSessionId | 리뷰 세션 ID |
| nodeType | File, Function, API, Flow |
| name | 노드 이름 |
| roleDescription | 역할 설명 |
| changeReason | 수정 이유 |
| diffSummary | 변경 요약 |
| reviewPoint | 리뷰 포인트 |
| judgement | NoIssue, NeedsDiscussion, Unknown |
| orderIndex | 리뷰 화면 표시 순서 |
| createdAt | 생성일 |
| updatedAt | 수정일 |

제약 조건:

- `(reviewSessionId, orderIndex)`는 unique다.

## 7.23 AgentAction

| 필드 | 설명 |
| --- | --- |
| id | Agent 제안 또는 실행 요청 ID |
| workspaceId | Workspace ID |
| requestedByMemberId | 요청한 WorkspaceMember ID |
| actionType | CreateTask, LinkIssue, CreateReport, UpdateCanvas, AnalyzePullRequest |
| status | Proposed, Approved, Rejected, Executed, Failed |
| input | Agent가 참고한 입력 요약 |
| result | 실행 결과 요약 |
| errorMessage | 실패 사유 |
| createdAt | 생성일 |
| approvedAt | 승인일 |
| executedAt | 실행일 |

제약 조건:

- 실제 데이터 변경은 Approved 이후에만 수행한다.
- AgentAction은 감사 로그이며 원본 데이터의 상태를 대체하지 않는다.

## 7.24 Notification

| 필드 | 설명 |
| --- | --- |
| id | 알림 ID |
| workspaceId | Workspace ID |
| recipientMemberId | 알림 수신 WorkspaceMember ID |
| actorMemberId | 알림을 유발한 WorkspaceMember ID |
| type | TaskAssigned, TaskDueSoon, Mentioned, ReportCreated, ReviewRequested, AgentApprovalRequested |
| title | 알림 제목 |
| body | 알림 본문 |
| targetType | Task, MeetingReport, GithubIssue, GithubPullRequest, ReviewSession, AgentAction |
| targetId | 대상 ID |
| readAt | 읽은 시간 |
| handledAt | 처리 완료 시간 |
| createdAt | 생성일 |

제약 조건:

- `recipientMemberId`는 필수다.
- 알림 대상은 화면 이동용 참조다. 핵심 비즈니스 관계는 각 link 테이블을 사용한다.

---

# 9. MVP 성공 기준

## 9.1 기능 성공 기준

- 사용자가 Workspace를 만들고 팀원을 초대할 수 있다.
- Agent가 프로젝트 목표를 기반으로 MVP 기능과 Task를 추천할 수 있다.
- 사용자가 추천 Task를 승인하여 실제 Task로 만들 수 있다.
- Task를 GitHub Issue로 생성할 수 있다.
- GitHub PR을 불러와 Code Review Room에서 확인할 수 있다.
- Agent가 PR 변경 의도와 리뷰 포인트를 설명할 수 있다.
- 회의 내용을 Report로 생성하고 후속 작업을 Task로 만들 수 있다.

## 9.2 사용자 경험 성공 기준

- 초보 팀원이 “지금 무엇을 해야 하는지” 확인할 수 있다.
- 회의 결과가 Task로 연결된다.
- Task가 GitHub Issue로 연결된다.
- PR 리뷰 시 어떤 파일부터 봐야 하는지 알 수 있다.
- Merge 전 확인할 항목을 이해할 수 있다.

## 9.3 기술 성공 기준

- Workspace 단위로 데이터가 분리된다.
- GitHub Issue/PR 데이터가 안정적으로 동기화된다.
- Agent 응답은 실제 Workspace 데이터를 기반으로 생성된다.
- PR diff가 너무 큰 경우에도 요약 가능한 범위 제한 정책이 존재한다.
- 사용자가 승인하지 않은 Agent 제안은 실제 데이터로 저장되지 않는다.

---

# 10. 개발 시 주의사항

## 10.1 Agent는 자동 실행보다 승인 기반으로 동작해야 한다

초보 팀을 돕는 서비스이지만, Agent가 마음대로 Task, Issue, Report를 생성하면 사용자가 흐름을 이해하기 어렵다.

따라서 Agent는 “제안”하고, 사용자가 “승인”하면 실제 데이터로 저장되는 구조가 적합하다.

## 10.2 GitHub를 대체하지 말고 보조해야 한다

PILO의 목적은 GitHub를 없애는 것이 아니라 GitHub Issue와 PR을 초보자가 이해하기 쉽게 연결하는 것이다.

Merge, 코드 최종 승인, 브랜치 관리는 GitHub에서 수행하는 것이 안전하다.

## 10.3 Canvas는 메인 기능이 아니라 맥락 시각화 도구로 제한해야 한다

Canvas를 모든 기능의 중심으로 만들면 구현 범위가 과도하게 커질 수 있다.

MVP에서는 Task, Report, Issue, PR의 관계를 보여주는 시각화 도구로 제한한다.

## 10.4 Code Review Room을 차별화 기능으로 우선 구현해야 한다

PILO의 강한 차별점은 초보 개발자가 PR을 이해하고 리뷰할 수 있게 돕는 것이다.

따라서 단순 Task 관리보다 PR 분석, diff 설명, 리뷰 판단, Merge 체크리스트 기능의 완성도가 중요하다.

## 10.5 회의 Report는 단순 회의록이 아니라 실행 문서여야 한다

회의 내용을 예쁘게 요약하는 것보다, 결정사항과 후속 작업을 분리하고 Task로 연결하는 것이 핵심이다.

---

# 11. 최종 MVP 기능 요약

PILO MVP는 다음 기능을 반드시 구현해야 한다.

1. Workspace 생성 및 팀원 초대
2. AI 프로젝트 시작 가이드
3. 기술스택 추천
4. MVP 기능 분해
5. Task 생성 및 관리
6. Task와 GitHub Issue 연결
7. GitHub PR 불러오기
8. Code Review Room
9. PR 변경 흐름 노드 그래프
10. 노드별 diff 확인 및 리뷰 판단
11. Merge 전 체크리스트
12. 회의 Report 생성
13. Report 기반 Task 생성
14. 기본 Canvas
15. @Agent 호출
16. 기본 알림

PILO의 핵심 문장은 다음과 같다.

프로젝트 경험이 부족한 초보 개발팀을 위한 AI 프로젝트 운영 Agent.

팀의 목표를 기능과 일정으로 쪼개고, 회의·Task·GitHub Issue·PR 리뷰를 연결해 프로젝트를 단계별로 완주하도록 돕는다.
