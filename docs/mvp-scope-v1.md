# PILO MVP Scope v1

이 문서는 PILO MVP에서 만들 기능과 만들지 않을 기능을 고정하는 기준 문서다.
기능 명세 초안, 기존 계약 문서, 현재 `temp-dev` 구현 상태가 충돌할 때 MVP 범위 판단은 이 문서를 우선한다.

함께 읽을 문서:

- `docs/domain-boundary-v1.md` - 도메인 소유권과 cross-domain 규칙.
- `docs/api-contract-v1.md` - MVP API 계약.
- `docs/mvp-contract-v0.md` - 현재 `temp-dev` 구현 상태표.
- `docs/collaboration-v1.md` - 5인 + AI agent 협업 규칙.

## Scope Status

| 상태 | 의미 | 구현 판단 |
| --- | --- | --- |
| `Must` | MVP 완료 기준에 포함된다. 구현, 테스트, API 계약이 필요하다. | release blocker |
| `Should` | 구현하면 좋지만 MVP 완료를 막지 않는다. | non-blocking |
| `Could` | 후순위 아이디어다. 이번 MVP 구현 대상이 아니다. | backlog |
| `Excluded` | MVP에서 구현하지 않는다. 화면 CTA도 제한한다. | do not build |

## MVP Product Goal

PILO MVP는 초보 개발팀이 프로젝트를 시작하고, 작업을 Task로 쪼개고, GitHub Issue/PR과 연결하고, 회의 음성과 메모를 실행 가능한 Report/Task로 바꾸고, PR을 이해하며 리뷰할 수 있게 돕는 AI 프로젝트 운영 도구다.

MVP의 핵심 검증 질문:

1. 팀이 빈 Workspace에서 프로젝트 방향과 첫 Task를 만들 수 있는가?
2. Task와 GitHub Issue/PR이 연결되어 개발 흐름을 추적할 수 있는가?
3. 초보 리뷰어가 PR 변경 의도, 주요 파일, diff, 리뷰 질문을 이해할 수 있는가?
4. 회의 음성 transcript와 메모가 Report와 후속 Task로 이어지는가?
5. AI가 자동 실행하지 않고 사용자 승인 기반으로 안전하게 동작하는가?

## Global MVP Decisions

1. MVP에서는 RAG와 embedding 기반 검색을 구현하지 않는다.
2. AI context는 현재 화면, 선택 객체, 명시적 DB 조회, 연결 관계를 통해 주입한다.
3. Agent는 원본 데이터를 직접 수정하지 않는다.
4. Agent 산출물은 candidate 또는 draft 상태로 만들고, 사용자가 승인한 뒤 owner domain API가 실제 데이터를 생성한다.
5. GitHub 로그인과 GitHub Repository 연동은 분리한다.
6. GitHub Issue/PR 상태가 바뀌어도 PILO Task 상태를 자동 변경하지 않는다. 사용자에게 변경 제안만 표시한다.
7. Basic Voice/STT는 Meeting Report 입력으로 포함한다. 단, 호출어, 음성 명령, 고급 화자 분리는 제외한다.
8. Workspace 역할은 `Owner`, `Member`만 사용한다. `Viewer`는 MVP에서 제외한다.
9. Dashboard, Canvas, Notification은 원본 데이터를 소유하지 않는다.
10. 모든 MVP 데이터는 Workspace membership 기준으로 접근 제어한다.

## Must Scope

### Auth

| 기능 | 범위 |
| --- | --- |
| OAuth 로그인 | Google, GitHub OAuth 로그인 |
| 최초 사용자 생성 | 최초 OAuth 로그인 시 User 자동 생성 |
| OAuth 계정 중복 방지 | `provider + providerUserId` 기준 |
| 세션 쿠키 | HttpOnly session cookie 발급 |
| 현재 사용자 조회 | `/auth/me` 또는 v1 equivalent |
| 로그아웃 | 현재 세션 revoke |
| 보호 라우트 | 비로그인 사용자의 Workspace 화면/API 접근 차단 |

MVP 제외:

- 이메일/비밀번호 회원가입.
- 별도 회원가입 폼.
- 비밀번호 재설정.
- 이메일 인증.
- Google 계정과 GitHub 계정의 자동 병합.
- 프로필 수정.

### Workspace

| 기능 | 범위 |
| --- | --- |
| Workspace 생성 | 로그인 사용자가 생성하고 자동 Owner가 된다. |
| Workspace 목록 | 내가 속한 Workspace만 조회한다. |
| Workspace Summary 조회 | Dashboard와 권한 체크에 필요한 최소 상세 정보 조회 |
| 현재 Workspace 선택 | URL workspaceId 우선, 접근 권한 없으면 에러 |
| 초대 링크 생성 | Owner가 token 기반 초대 링크 생성 |
| 초대 수락 | 로그인 사용자가 token으로 Member 참여 |
| 멤버 목록 조회 | Owner/Member가 Workspace 멤버 목록 조회 |
| Membership guard | Workspace 내부 데이터 접근 전 membership 확인 |

MVP 제외:

- 이메일 발송 초대.
- Workspace 이름/설명 수정.
- Workspace archive/delete.
- 멤버 역할 변경.
- 멤버 제거.
- Viewer role.
- Dashboard layout 개인화 저장.

### Project Start Agent

| 기능 | 범위 |
| --- | --- |
| 단계별 질문 | 프로젝트 목표, 기간, 팀원 수, 경험 수준, 산출물 목표 |
| ProjectBrief 생성 | 입력값을 바탕으로 프로젝트 요약 초안 생성 |
| 기술스택 추천 | 2개 이상 후보와 추천 이유 제시 |
| 기능 범위 분류 | Must/Should/Excluded 후보 제시 |
| Task 후보 생성 | 하루 단위, 담당자 후보, 완료 조건 포함 |
| 승인 플로우 | 사용자가 승인한 Task 후보만 실제 Task로 생성 |

MVP 제외:

- 프로젝트 시작 Agent 음성 입력.
- 호출어.
- 장기 개인화.
- RAG/embedding 검색.
- 자동 Task 생성.
- 자동 GitHub Issue 생성.

### Task

| 기능 | 범위 |
| --- | --- |
| Task CRUD | 생성, 목록, 상세, 수정, 삭제 |
| 상태 변경 | `todo`, `in_progress`, `in_review`, `done`, `blocked` |
| 담당자 지정 | Workspace Member 중 선택 |
| 마감일 설정 | optional dueDate |
| 우선순위 | `low`, `medium`, `high`, `urgent` |
| Task type | MVP Target. Current runtime/schema에는 아직 `taskType` field가 없으므로 후속 Task contract/runtime PR 전까지 보내지 않는다. |
| 완료 조건 | MVP Target. Current runtime/schema에는 아직 `acceptanceCriteria` field가 없으므로 후속 Task contract/runtime PR 전까지 보내지 않는다. |
| Agent Task 후보 승인 | candidate를 승인/거절/수정 후 승인 |
| GitHub Issue 연결 표시 | 연결된 issue 번호, url, state 표시 |
| PR 연결 표시 | 연결된 PR 번호, state, review room link 표시 |

정책:

- 개발 타입 Task는 GitHub Issue 연결을 권장하지만 필수는 아니다.
- Task 상태는 PILO가 소유한다.
- GitHub 상태 변경은 Task 상태 자동 변경의 근거가 아니다.

### GitHub Integration

| 기능 | 범위 |
| --- | --- |
| GitHub 연동 | 로그인 OAuth와 별도인 GitHub App/OAuth repository 권한 |
| Repository 연결 | Workspace당 Repository 1개 |
| Repository 목록 조회 | 연결 가능한 repo 목록 |
| 수동 동기화 | 사용자가 Issue/PR sync 실행 |
| Issue 목록 조회 | 연결 repo의 Issue metadata 조회 |
| Task에서 Issue 생성 | 사용자 확인 후 GitHub Issue 생성 |
| 기존 Issue와 Task 연결 | 기존 GitHub Issue를 PILO Task와 연결 |
| Issue 상태 표시 | open/closed, lastSyncedAt |
| PR 목록 조회 | 연결 repo의 Pull Request metadata 조회 |
| PR 상세 조회 | 제목, 본문, 작성자, 상태, changed files summary |
| PR과 Task 연결 | 여러 Task 연결 가능 |
| PR과 Issue 연결 | 관련 Issue 연결 가능 |
| GitHub 원본 링크 | repo, issue, PR 원본으로 이동 |
| 기본 오류 상태 | token 만료, 권한 부족, API 실패 |

MVP 제외:

- Workspace당 여러 Repository.
- Webhook 기반 실시간 동기화.
- GitHub Projects 동기화.
- Milestone 고급 관리.
- Label 양방향 자동 동기화.
- Issue/PR 본문 자동 수정.
- 서비스 내 PR merge.
- 서비스 내 GitHub review comment 작성.
- GitHub Actions 상세 로그 분석.
- Branch 생성.
- Commit 단위 상세 분석.

### Meeting / Voice / Report

| 기능 | 범위 |
| --- | --- |
| 회의 시작 | Workspace 안에서 text/voice meeting session 시작 |
| 회의 메모 | 텍스트 메모 작성 |
| Voice session 시작/종료 | 사용자가 명시적으로 회의 음성 기록 시작/종료 |
| STT transcript 생성 | 회의 음성을 timestamped transcript segment로 저장 |
| Transcript 확인/수정 | 사용자가 STT 결과를 확인하고 segment text를 수정 |
| 회의 종료 | Report 생성 트리거 |
| ReportDraft 생성 | transcript, 메모, Agent chat, Task 변경, Canvas 참조 기반 |
| Report 편집/확정 | 사용자가 수정 후 확정 |
| Action Item 추출 | 후속 작업 후보 생성 |
| Action Item to Task | 사용자 승인 후 Task 생성 |
| Report 조회 | Workspace Report 목록/상세 |

MVP 제외:

- 호출어 기반 회의 조작.
- 음성 명령으로 Task/Issue/Report를 바로 생성하는 기능.
- 고급 화자 분리.
- 실시간 팀 음성채팅 플랫폼 수준의 기능.
- 투표.
- 파일 첨부.
- 자동 GitHub Issue 생성.

### Code Review Room

| 기능 | 범위 |
| --- | --- |
| PR 선택 | 연결 repo의 PR 선택 |
| PR 전체 요약 | 변경 목적, 범위, 먼저 볼 파일 설명 |
| 변경 파일 목록 | 파일별 additions/deletions/status |
| diff viewer | 파일별 diff 표시 |
| Review graph | 파일 또는 모듈 단위 관계 그래프 |
| 노드 상세 | 역할, 변경 이유, diff, 리뷰 질문 |
| 리뷰 판단 | 문제 없음, 논의 필요, 판단 불가 |
| 내부 리뷰 결과 저장 | PILO ReviewSession에만 저장 |
| Merge checklist | GitHub merge 전에 확인할 항목 |
| diff size limit | 분석 가능 범위 제한 및 초과 안내 |

정책:

- Agent는 최종 merge 여부를 판단하지 않는다.
- 실제 merge는 GitHub에서 한다.
- GitHub 댓글, 승인, 변경 요청은 MVP에서 하지 않는다.

### Agent Command Chat

| 기능 | 범위 |
| --- | --- |
| Agent 전용 텍스트 입력 | 팀 채팅이 아니라 Agent command chat |
| 현재 화면 context | 화면, 선택 Task/PR/Report/Meeting 정보를 포함 |
| 응답 카드 | Task 후보, Report 반영 후보, PR 분석 요약 |
| 승인 카드 | 데이터 변경 전 사용자 확인 |
| Agent 실행 상태 | 대기, 처리 중, 확인 대기, 완료, 실패 |

MVP 제외:

- 사용자 간 실시간 채팅.
- 멘션.
- 읽음 표시.
- 파일 첨부.
- 메시지 스레드.
- RAG 기반 과거 대화 검색.

### Minimal Notification

Status: `Target/Deferred`.

Minimal Notification은 제품적으로 필요한 MVP Target이지만 현재 runtime에는
Notification controller가 없고 구현 owner도 DevOps/공통 Backend gatekeeper 상태다.
따라서 현재 freeze 기준에서는 release blocker가 아니며, MVP Must로 승격하려면
먼저 owner 지정과 Common System contract/runtime PR이 필요하다.

| 기능 | 범위 |
| --- | --- |
| Agent 승인 대기 표시 | Task/Report/Issue 생성 승인 필요 |
| 담당 Task 알림 | 내가 담당자로 지정된 Task |
| 리뷰 요청 알림 | 나와 관련된 PR review 필요 |
| 알림 목록 | 최신순 기본 목록 |
| 읽음 처리 | 개별 읽음 처리 |
| 관련 화면 이동 | Task, Report, PR, Agent approval로 이동 |

MVP 제외:

- 알림 설정.
- 복잡한 필터.
- 채팅 멘션 알림.
- 이메일/푸시 알림.
- 전체 notification analytics.

## Should Scope

### Basic Canvas

Canvas는 MVP release blocker가 아니다. 구현하더라도 Basic Canvas만 대상으로 한다.

| 기능 | 범위 |
| --- | --- |
| Canvas Board 생성/조회 | Workspace 안의 board 목록/상세 |
| Memo shape | Canvas 전용 텍스트 메모. 서버 저장은 후속 contract PR 전까지 local-only UI state다. |
| Reference shape | Task, Report, Issue, PR 참조 shape |
| Shape position | 위치, 크기 저장 |
| Connection | shape 간 기본 연결 |
| Shape detail panel | 원본 요약과 원본 화면 이동 |

MVP 제외:

- Drawing.
- Frame.
- Code Block.
- Vote.
- File node.
- Code Reference shape.
- Agent 자동 배치.
- 실시간 협업.
- Canvas가 원본 Task/Report/Issue/PR을 수정하는 기능.

용어 정책:

- Workspace Canvas current runtime은 `shapes`/`connections`만 사용한다.
- `nodes`/`edges`는 은재 Review internal canvas/graph 용어이거나 legacy target
  표현이며, 동현 Workspace Canvas API/fixture/schema에는 쓰지 않는다.
- `connectionType`은 current runtime/schema/SQL에서
  `related_to`, `created_from`, `blocks`, `references`, `implements`, `reviews`
  enum만 사용한다. freeform connection type 추가는 후속 contract 결정 사항이다.

### Dashboard

Dashboard는 여러 도메인의 요약을 보여주는 read-only 화면이다.

Must에 가까운 최소 범위:

- Workspace Summary.
- 진행 중 Task.
- 마감 임박 Task.
- 연결된 GitHub Issue/PR 요약.
- 최근 Report.
- Agent 다음 행동 제안.

Dashboard 개인화, layout 저장, hidden section은 제외한다.

## Explicitly Excluded From MVP

| 기능 | 이유 |
| --- | --- |
| RAG/embedding | 색인, 권한 필터, 재색인, 삭제 동기화 비용이 MVP 가치보다 큼 |
| 음성 명령/호출어/고급 화자 분리 | Basic transcript보다 구현/UX/정확도 리스크가 큼 |
| 서비스 내 merge | GitHub 권한과 책임 경계가 위험함 |
| GitHub webhook | 동기화 복잡도 증가. 수동 sync로 검증 가능 |
| 사용자 간 실시간 채팅 | Agent command chat으로 대체 |
| 공유 드라이브 | 파일 저장/권한/Canvas 연결 범위가 큼 |
| 복잡한 권한 | Owner/Member로 충분 |
| VS Code Extension | 핵심 검증 이후 확장 |
| 고급 테스트 자동화 | PR 이해와 리뷰 지원이 우선 |
| 장기 개인화 | 개인정보/추천 품질 검증 후 도입 |

## MVP Success Criteria

MVP 완료 기준은 Must 기능만으로 판단한다.

1. 사용자는 OAuth로 로그인하고 Workspace를 만들 수 있다.
2. Owner는 초대 링크로 Member를 초대할 수 있다.
3. Agent는 프로젝트 시작 질문을 통해 ProjectBrief, 기술스택 후보, 기능 범위, Task 후보를 생성할 수 있다.
4. 사용자는 승인한 Task 후보를 실제 Task로 만들 수 있다.
5. 사용자는 Task를 생성, 수정, 상태 변경, 담당자 지정, 마감일 설정할 수 있다.
6. 사용자는 Workspace에 GitHub Repository 1개를 연결할 수 있다.
7. 사용자는 Task에서 GitHub Issue를 생성하거나 기존 Issue와 연결할 수 있다.
8. 사용자는 PR 목록을 불러와 Task/Issue와 연결할 수 있다.
9. 사용자는 PR을 Code Review Room에서 열고 요약, diff, review graph, checklist를 볼 수 있다.
10. 사용자는 회의 음성 transcript와 메모를 ReportDraft로 만들고 후속 작업을 Task로 전환할 수 있다.
11. Agent가 제안한 데이터 변경은 사용자 승인 전 실제 데이터로 저장되지 않는다.
12. Workspace membership이 없는 사용자는 Workspace 내부 데이터에 접근할 수 없다.

## Revisit Triggers

다음 조건이 발생하면 RAG, Canvas, Notification 확장을 다시 검토한다.

| 조건 | 검토 대상 |
| --- | --- |
| Workspace당 Task/Issue/Report가 100개 이상 쌓인다 | RAG 또는 검색 index |
| 사용자가 과거 결정사항 검색을 반복적으로 요청한다 | Meeting/Review selective RAG |
| Code Review Room에서 관련 과거 문맥 부재가 주요 불만이 된다 | PR review RAG |
| Canvas가 실제 사용자 workflow의 중심이 된다 | Canvas Must 승격 |
| 알림 누락이 작업 실패의 주요 원인이 된다 | Notification center 확장 |
