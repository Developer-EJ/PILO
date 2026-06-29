# PILO Independent Agent Briefs

이 폴더는 각 개발자가 자기 AGENT에게 가장 먼저 먹일 구현 지시서다. 목적은 한 사람이 다른 사람의 구현 완료를 기다리지 않고도 contract, mock, fixture, API 경계만으로 독립 개발을 시작할 수 있게 만드는 것이다.

## 시작 순서

1. `agent.md`를 읽는다.
2. `docs/agent-collaboration-guide.md`를 읽는다.
3. 본인 담당 파일을 읽는다.
4. 본인 domain contract와 소비하는 contract를 읽는다.
5. 본인 domain OpenAPI/Schema fragment를 먼저 확인한다.
6. DB 변경이 있으면 본인 domain DB/Prisma shard를 먼저 확인한다.
7. 중앙 bundle/schema/fixture/DB 파일은 읽기 전용으로 확인한다.
8. 중앙 파일 변경이 필요하면 Feature PR이 아니라 Contract Integration PR로 분리한다.

## 담당자별 구현 지시서

| 담당자 | 지시서 | 핵심 영역 |
|---|---|---|
| 동현 | `donghyun-auth-workspace-canvas.md` | Auth, Workspace, Dashboard, Canvas |
| 주형 | `juhyung-task-github-progress.md` | Task, GitHub, Progress |
| 진호 | `jinho-meeting-report.md` | Meeting, Voice, Report |
| 은재 | `eunjae-pr-review.md` | Code Review Room, PR Analysis |
| 세인 | `sein-agent-planning.md` | Agent Runtime, Orchestrator, Planning |
| 전체 | `shared-implementation-rules.md` | 공통 구현 규칙, mock, PR 기준 |

## 독립 구현 원칙

- 다른 도메인의 DB table, repository, service를 직접 수정하지 않는다.
- 다른 도메인 데이터가 필요하면 contract read model, API, event, Agent action, fixture 중 하나로 받는다.
- 의존 도메인이 아직 구현되지 않았으면 `docs/contracts/fixtures`의 mock으로 먼저 구현한다.
- mock을 쓰는 PR에는 후속 실제 연동 Issue를 반드시 연결한다.
- public DTO와 Agent action payload는 JSON Schema 이름과 필드명을 기준으로 맞춘다.
- DB FK를 직접 걸 수 없는 다형 참조는 API 또는 contract test에서 검증한다.
- contract가 부족하면 구현 PR 전에 contract change PR을 먼저 올린다.

## 공통 현재 앱 경로

| 앱 | 역할 | 기본 경로 |
|---|---|---|
| Frontend | Next.js 화면 | `apps/frontend` |
| App Server | NestJS REST API | `apps/app-server` |
| Realtime Server | NestJS WebSocket | `apps/realtime-server` |
| AI Worker | FastAPI worker | `apps/ai-worker` |
| Infra | Terraform, scripts | `infra` |

## 권장 도메인 경로

구현을 시작할 때 아래 경로를 만든다. 같은 도메인 안에서만 자유롭게 수정한다.

| 계층 | 권장 경로 예시 |
|---|---|
| Frontend route | `apps/frontend/app/(workspace)/...` |
| Frontend component | `apps/frontend/components/<domain>/...` |
| Frontend hook | `apps/frontend/hooks/<domain>/...` |
| App Server module | `apps/app-server/src/modules/<domain>/...` |
| Public contract adapter | `apps/app-server/src/modules/<domain>/public/...` |
| Realtime namespace | `apps/realtime-server/src/<domain>/...` |
| AI workflow | `apps/ai-worker/app/workflows/<domain>/...` |

## 구현 시작 전 체크

- 본인 owner와 domain이 PR 제목에 들어갔는가?
- 내가 수정하는 파일이 내 담당 domain 안에 있는가?
- 필요한 외부 데이터의 owner와 contract를 문서에 적었는가?
- fixture로 대체하는 의존성이 있으면 제거 계획 Issue를 만들었는가?
- DB 변경, API 변경, Agent action 변경이 있으면 contract 문서도 같이 바꿨는가?
