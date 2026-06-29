# PILO Agent 협업 폴더 구조 및 컨벤션

## 목적

이 문서는 PILO 프로젝트를 여러 개발자와 여러 Agent가 동시에 개발할 때 충돌을 줄이기 위한 작업 규칙이다.

기준 문서는 `docs/PILO_5인_분업_상세_명세.md`이며, 원칙은 다음과 같다.

- 서버 단위가 아니라 도메인 단위로 책임을 나눈다.
- 다른 도메인의 데이터, 서비스, DB 모델을 직접 수정하지 않는다.
- 도메인 간 연동은 API, 이벤트, 계약 문서를 통해 진행한다.
- 공통 Agent Runtime과 Orchestrator는 세인이 관리한다.
- 동현, 주형, 진호, 은재는 각자 도메인별 Agent Workflow를 관리한다.

## 문서 역할 분리

협업 규칙은 아래처럼 나눠서 관리한다.

| 문서 | 담당 범위 |
|---|---|
| `convention.md` | Issue, Branch, PR, Commit 운영 규칙 |
| `docs/agent-collaboration-guide.md` | Agent별 도메인 소유권, 폴더 구조, 계약, 충돌 방지 |
| `docs/agents/README.md` | 담당자별 독립 구현 지시서와 mock 사용 기준 |
| `docs/contracts/README.md` | 담당자별 contract 색인과 읽는 순서 |
| `docs/contracts/contract-change-rules.md` | Contract 변경, 리뷰, self-approve 규칙 |
| `docs/contracts/interface-contract-guide.md` | 겹치는 기능의 API, read model, event, Agent action 연결 규칙 |
| `docs/contracts/schemas/pilo-public-contracts.schema.json` | Public DTO와 Agent action payload의 기계 검증 기준 |
| `docs/contracts/fixtures` | provider domain 미구현 시 consumer가 쓰는 mock fixture |
| `docs/infra/ci.md` | CI required checks, branch protection, 배포 전 검증 |
| `docs/PILO_5인_분업_상세_명세.md` | 5인 기능 분업과 도메인 책임 |

따라서 이 문서에서는 Git 운영 규칙을 반복하지 않고, Agent 협업에 필요한 추가 규칙만 정의한다.

## 담당 도메인

| 담당 | 도메인 | 핵심 책임 |
|---|---|---|
| 동현 | Auth / Login / Signup / Workspace / Dashboard / Canvas | 로그인/회원가입, 프로젝트 공간, 대시보드, 시각화 |
| 주형 | Task / GitHub / Progress | 작업 관리, GitHub 연동, 진행률 |
| 진호 | Meeting / Voice / Report | 회의, 음성, 회의록, 액션 아이템 |
| 은재 | Code Review Room / PR Analysis | PR 분석, 코드 리뷰, 변경 영향도 |
| 세인 | Agent Runtime / Orchestrator / Planning | 공통 Agent 실행 구조, 계약, 프로젝트 기획 |

## 권장 폴더 구조

현재 앱은 최소 구조로 시작되어 있으므로, 기능 구현이 시작되면 아래 구조를 기준으로 확장한다.

```text
apps/
  frontend/
    app/
      (auth)/
      (workspace)/
    components/
      workspace/
      canvas/
      task/
      github/
      meeting/
      review/
      agent/
      shared/
    hooks/
      workspace/
      task/
      meeting/
      review/
    lib/
      api/
      types/

  app-server/
    src/
      modules/
        workspace/
        auth/
        task/
        github/
        progress/
        meeting/
        report/
        review/
        agent/
        planning/
      common/
        config/
        database/
        auth/
        errors/
        events/

  realtime-server/
    src/
      meeting/
      voice/
      canvas/
      common/
        config/
        auth/
        events/

  ai-worker/
    app/
      runtime/
      workflows/
        agent/
        planning/
        meeting/
        task/
        review/
      common/
        config/
        clients/
        schemas/

docs/
  agents/
    README.md
    donghyun-auth-workspace-canvas.md
    juhyung-task-github-progress.md
    jinho-meeting-report.md
    eunjae-pr-review.md
    sein-agent-planning.md
  contracts/
    workspace.md
    auth.md
    canvas.md
    task.md
    github.md
    progress.md
    meeting.md
    review.md
    agent-actions.md
    planning.md
    common-system.md
    fixtures/
      workspace-dashboard.fixture.json
    schemas/
      pilo-public-contracts.schema.json
  infra/
```

## 도메인별 소유 경로

각 Agent는 기본적으로 자기 도메인 경로 안에서 작업한다.

| 담당 | Frontend | App Server | Realtime Server | AI Worker | 계약 문서 |
|---|---|---|---|---|---|
| 동현 | `auth`, `workspace`, `dashboard`, `canvas` | `auth`, `workspace`, `canvas` | 필요 시 `canvas` event 조회 | 없음 | `docs/contracts/auth.md`, `workspace.md`, `canvas.md` |
| 주형 | `task`, `github`, `progress` | `task`, `github`, `progress` | 없음 | 필요 시 `task` workflow adapter | `docs/contracts/task.md`, `github.md`, `progress.md` |
| 진호 | `meeting`, `voice`, `report` | `meeting`, `report` | `meeting`, `voice` | `meeting` workflow | `docs/contracts/meeting.md` |
| 은재 | `review` | `review` | 없음 | `review` workflow | `docs/contracts/review.md` |
| 세인 | `agent`, `planning` | `agent`, `planning` | 공통 event 필요 시 | `agent`, `planning` | `docs/contracts/agent-actions.md`, `planning.md` |

## 공유 영역

아래 경로는 충돌 가능성이 높으므로 단독 판단으로 크게 바꾸지 않는다.

| 경로 | 변경 규칙 |
|---|---|
| `apps/*/package.json` | 의존성 추가 이유를 PR에 명시한다. |
| `apps/*/package-lock.json` | 의존성 추가 작업 외에는 수정하지 않는다. |
| `apps/ai-worker/requirements*.txt` | Python 의존성 추가 이유를 PR에 명시한다. |
| `apps/*/src/common` | 두 개 이상 도메인이 쓰는 코드만 둔다. |
| `apps/frontend/components/shared` | UI 재사용 컴포넌트만 둔다. |
| `apps/frontend/lib` | API client, type, util 등 재사용 코드만 둔다. |
| `apps/*/src/main.*` | 앱 부트스트랩 변경은 영향 범위를 PR에 적는다. |
| `.github/workflows` | CI/CD 변경은 DevOps 리뷰를 받는다. |
| `infra`, `modules`, `envs` | AWS 변경은 Terraform으로만 관리한다. |
| `docs/contracts` | 도메인 간 계약 변경 시 먼저 수정한다. |
| `docs/agents` | 담당자별 구현 지시서 변경 시 해당 담당자 리뷰를 받는다. |
| `docs/contracts/fixtures` | mock 데이터 변경 시 consuming domain을 PR에 적는다. |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR 필수 입력 항목을 바꾸므로 팀 합의 후 수정한다. |
| `.github/ISSUE_TEMPLATE` | Issue 생성 기준에 영향을 주므로 팀 합의 후 수정한다. |

Auth/Login/Signup은 동현이 소유한다. Google/GitHub 소셜 로그인, 사용자 세션, 로그아웃, 가입 진입 UX는 동현이 담당하고, GitHub Repository 연결 및 Issue/PR API 권한은 주형의 GitHub 연동 계약으로 분리한다.

## 충돌 방지 규칙

1. 자기 도메인 밖의 파일을 수정해야 하면 PR 설명에 이유를 적는다.
2. 다른 도메인의 DB 모델, service, repository를 직접 수정하지 않는다.
3. 다른 도메인의 데이터가 필요하면 해당 도메인의 API, event, read model을 사용한다.
4. 계약 변경은 구현보다 먼저 `docs/contracts/*.md`에 반영한다.
5. breaking change는 바로 적용하지 않고, 기존 필드를 deprecated 처리한 뒤 다음 PR에서 제거한다.
6. 공통 유틸은 처음부터 만들지 말고, 두 도메인 이상에서 반복될 때 `common` 또는 `shared`로 승격한다.
7. Agent Workflow는 각 도메인이 소유하되, 실행 상태, trace, action contract는 세인의 Agent Runtime 규칙을 따른다.
8. 겹치는 기능은 `docs/contracts/interface-contract-guide.md`의 owner/consumer/interface 규칙을 따른다.
9. public DTO와 Agent action payload는 `docs/contracts/schemas/pilo-public-contracts.schema.json`에 맞춘다.
10. provider domain이 아직 없으면 `docs/contracts/fixtures`의 fixture로 먼저 구현하고, PR에 실제 연동 후속 Issue를 연결한다.

## Agent 작업 표기 규칙

Issue, Branch, PR, Commit의 기본 규칙은 `convention.md`를 따른다.

Agent 협업에서는 제목이나 본문에 담당자와 도메인을 함께 적어 충돌 가능성을 줄인다.

```text
[동현][workspace] Workspace 목록 화면 구현
[동현][auth] Google/GitHub 로그인 구현
[주형][task] Task 생성 API 구현
[진호][meeting] 회의록 생성 workflow 구현
[은재][review] PR 변경 파일 분석 구현
[세인][agent] Agent action contract v1 정의
```

## API 및 계약 문서 규칙

도메인 간 연동은 아래 내용을 계약 문서에 남긴다.
계약 변경 절차는 `docs/contracts/contract-change-rules.md`를 따른다.
구현 전에는 `docs/contracts/README.md`에서 본인 도메인과 소비 도메인 contract를 확인한다.

```text
# 예시: docs/contracts/task.md

## Owner
주형

## Provided APIs
- POST /tasks
- GET /tasks/:id
- PATCH /tasks/:id/status

## Consumed By
- 동현: Dashboard, Canvas
- 진호: Meeting action item to task draft
- 은재: PR to task link
- 세인: Agent action execution

## Events
- task.created
- task.status_changed

## Read Models
- TaskSummary
- ProgressSummary
```

## Agent Action 계약

Agent가 실제 데이터를 바꾸는 작업은 반드시 action contract를 사용한다.

```json
{
  "type": "task.create.draft",
  "source": "meeting.report",
  "requiresConfirmation": true,
  "payload": {
    "title": "GitHub Repository 연결 구현",
    "description": "사용자가 Repository 접근 권한을 승인하고 프로젝트 저장소를 선택할 수 있게 한다.",
    "assigneeId": "user_123",
    "priority": "high",
    "dueDate": "2026-07-03"
  }
}
```

규칙:

- `type`은 `domain.action.target` 형태를 사용한다.
- 실제 생성, 수정, 삭제는 `requiresConfirmation` 정책을 따른다.
- action 실행 결과는 Agent Runtime의 `AgentRun`, `AgentAction`, `AgentTrace`에 기록한다.
- 동현, 주형, 진호, 은재가 workflow를 만들더라도 action schema의 최종 형식은 세인이 관리한다.

## 파일 네이밍 규칙

### Frontend

```text
apps/frontend/app/(workspace)/tasks/
  page.tsx
apps/frontend/components/task/
  components/
    TaskList.tsx
    TaskStatusBadge.tsx
apps/frontend/hooks/task/
  useTasks.ts
apps/frontend/lib/api/
  taskApi.ts
apps/frontend/lib/types/
  task.types.ts
```

### NestJS

```text
apps/app-server/src/modules/task/
  task.module.ts
  task.controller.ts
  task.service.ts
  task.repository.ts
  public/
    task-read-model.service.ts
  dto/
    create-task.dto.ts
    update-task-status.dto.ts
  entities/
    task.entity.ts
  tests/
    task.service.spec.ts
```

### FastAPI

```text
apps/ai-worker/app/workflows/review/
  service.py
  schemas.py
  workflow.py
  prompts.py
  tests/
    test_review_workflow.py
```

## DB 및 Migration 규칙

DB 변경이 생기면 도메인 소유자를 기준으로 migration을 작성한다.

```text
YYYYMMDDHHMM_owner-slug_domain_action

202607011130_juhyung_task_create_tasks
202607021020_jinho_meeting_create_reports
202607031430_sein_agent_create_agent_runs
```

규칙:

- migration 파일명에는 한글 이름 대신 owner slug를 쓴다. 예: `donghyun`, `juhyung`, `jinho`, `eunjae`, `sein`.
- 다른 도메인의 테이블을 직접 수정하지 않는다.
- 외래키가 필요하면 양쪽 도메인 소유자가 계약을 먼저 합의한다.
- Dashboard, Canvas는 원본 데이터를 소유하지 않고 read model 또는 API 결과를 사용한다.
- migration은 되돌릴 수 있는 형태로 작성한다.

## CI 및 Merge 규칙

현재 `dev`와 `main`은 branch protection 대상이다.

- Branch, PR, Commit 운영은 `convention.md`를 따른다.
- PR 대상 브랜치는 `dev`로 한다.
- `dev` merge 전에는 CI만 실행한다.
- 실제 배포는 `main` merge 후 배포 workflow로 실행한다.
- required checks는 `docs/infra/ci.md`를 따른다.
- CI 실패 시 같은 PR 안에서 수정한다.

필수 check:

- `frontend`
- `app-server`
- `realtime-server`
- `ai-worker`
- `app-server-image`
- `realtime-server-image`
- `ai-worker-image`
- `secrets`
- `python-audit`
- `terraform`

## 리뷰 요청 기준

| 변경 종류 | 필수 리뷰 |
|---|---|
| 자기 도메인 내부 변경 | 같은 기능 담당자 1명 |
| 계약 문서 변경 | 영향을 받는 도메인 담당자 |
| Agent action contract 변경 | 세인 |
| GitHub, Task, Progress 변경 | 주형 |
| Meeting, Voice, Report 변경 | 진호 |
| PR Analysis 변경 | 은재 |
| Auth, Login, Signup, Workspace, Dashboard, Canvas 변경 | 동현 |
| Terraform, ECS, SQS, RDS, Redis, GitHub Actions | DevOps |

## 작업 전 체크리스트

- `convention.md`에 맞게 Issue와 Branch를 준비했는가?
- 내 작업이 어느 담당 도메인인지 정했는가?
- 다른 도메인의 파일을 수정해야 하는 이유가 명확한가?
- 계약 문서가 먼저 필요한 변경인가?
- DB 변경 또는 Agent action 변경이 포함되는가?
- 의존성 추가가 꼭 필요한가?

## PR 제출 전 체크리스트

- 자기 도메인 경로 중심으로 변경했는가?
- 공유 영역 변경 사유를 PR에 적었는가?
- 계약 문서를 함께 수정했는가?
- 테스트 또는 smoke check를 추가했는가?
- 로컬에서 관련 lint, test, build를 확인했는가?
- PR 대상 브랜치가 `dev`인가?
- PR 본문에 관련 Issue close 문구를 적었는가?

## 피해야 할 작업

- Dashboard 구현 중 Task service를 직접 수정한다.
- Meeting 구현 중 Task DB에 직접 insert한다.
- PR 분석 구현 중 GitHub Repository 연동 로직을 수정한다.
- GitHub Repository 연동 구현 중 로그인 세션/회원가입 로직을 수정한다.
- Agent workflow 구현 중 공통 action schema를 임의로 바꾼다.
- UI 편의를 위해 다른 도메인의 타입 파일을 직접 가져와 강하게 결합한다.
- 의존성 추가 없이 해결 가능한 문제에 새 패키지를 추가한다.
- Terraform이 아닌 콘솔 수동 변경으로 AWS 리소스를 수정한다.

## 권장 작업 흐름

1. `convention.md`에 따라 Issue를 만들고 `dev`에서 작업 브랜치를 만든다.
2. 자기 도메인 폴더 안에 기능을 구현한다.
3. 다른 도메인 연동이 필요하면 `docs/contracts`를 먼저 수정한다.
4. API, event, action contract를 통해 연결한다.
5. 테스트를 추가한다.
6. PR을 `dev`로 올린다.
7. CI 통과 후 리뷰를 받는다.
8. `dev`에서 통합 검증 후 `main`으로 승격한다.
