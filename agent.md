# PILO Agent 작업 시작 가이드

이 문서는 모든 Agent가 작업을 시작할 때 가장 먼저 읽는 요약 규칙이다.
공식 bootstrap 파일명은 `agent.md`다. 이 저장소는 별도 `AGENTS.md`를 기준 문서로 사용하지 않는다.

## 1. 먼저 읽을 문서

- `docs/README.md`: 문서 권위 순서와 archive 정책
- `docs/mvp-scope-v1.md`: MVP 포함/제외 기능 범위
- `docs/domain-boundary-v1.md`: 도메인 소유권, source of truth, cross-domain 규칙
- `docs/api-contract-v1.md`: MVP 목표 API 계약
- `docs/db/mvp-db-schema-v1.md`: MVP 목표 DB 구조
- `docs/collaboration-v1.md`: 5인 + AI agent 협업 규칙
- `docs/convention.md`: Issue, Branch, PR, Commit 규칙
- `docs/llm-coding-guidelines.md`: LLM 코딩 행동 지침
- `docs/design.md`: PILO 화면 디자인 토큰, 레이아웃, 컴포넌트 규칙
- `docs/agents/README.md`: 담당자별 독립 구현 지시서 입구
- `docs/contracts/README.md`: 담당자별 contract 색인
- `docs/contracts/contract-change-rules.md`: contract 변경, 리뷰, self-approve 규칙
- `docs/contracts/interface-contract-guide.md`: 겹치는 기능의 interface/read model/event/Agent action 규칙
- `docs/contracts/<domain>.md`: 본인 도메인과 소비 도메인의 API/read model/event/action 규칙
- `docs/contracts/schemas/pilo-public-contracts.schema.json`: public DTO와 Agent action payload schema
- `docs/contracts/fixtures`: provider 미구현 시 사용하는 mock fixture
- `docs/infra/ci.md`: CI, required checks, branch protection

`docs/archive/**` 문서는 역사적 참고 자료다. archive 문서를 기준으로 구현하지 않는다.

## Agent Start Checklist

모든 agent는 구현 전에 반드시 아래 순서를 완료한다.

1. `temp-dev` 최신 커밋에서 새 작업 브랜치를 만든다.
2. `agent.md`와 `docs/README.md`를 읽는다.
3. `docs/mvp-scope-v1.md`, `docs/domain-boundary-v1.md`, `docs/api-contract-v1.md`, `docs/db/mvp-db-schema-v1.md`, `docs/collaboration-v1.md`를 읽는다.
4. `docs/agents/README.md`와 본인 도메인 brief를 읽는다.
5. 본인 도메인이 제공하거나 소비하는 `docs/contracts/*` 문서를 읽는다.
6. 수정 가능 파일, 금지 파일, mock/fixture/in-memory/Deferred API 사용 여부를 작업 지시 첫머리에 명시한다.

금지:

- `docs/archive/**`를 구현 기준으로 사용하지 않는다.
- 본인 도메인 밖 DB table, service, repository를 직접 수정하지 않는다.
- 문서에 없는 API, DTO field, DB field를 임의로 만들지 않는다.
- contract 변경과 구현 변경을 한 PR에 섞지 않는다.
- DB 구조 변경은 `docs/db/mvp-db-schema-v1.md`와 Prisma/SQL/migration/test를 함께 맞춘다.
- shared/common 파일 변경은 기능 구현 PR에 섞지 않고 contract/spec/infra/hygiene PR로 분리한다.

## 2. 핵심 원칙

- 서버 단위가 아니라 도메인 단위로 작업한다.
- 구현 전 가정, 대안, 성공 기준을 먼저 확인한다.
- 요청 범위 밖의 기능, 추상화, 리팩토링을 추가하지 않는다.
- 자기 도메인 밖의 파일을 수정하면 PR 설명에 이유와 범위를 남긴다.
- 다른 도메인의 DB 모델, service, repository를 직접 수정하지 않는다.
- 도메인 간 연동은 API, event, read model, contract로 처리한다.
- 겹치는 기능은 원본 owner 1명이 소유하고 consumer는 interface contract로만 접근한다.
- Internal contract는 owner가 관리하되 외부 consumer가 없음을 PR에 명시한다.
- Public contract 변경은 구현보다 먼저 별도 PR로 올려 merge한다.
- public DTO/action payload는 `docs/contracts/schemas`의 schema와 맞춘다.
- AWS 작업은 콘솔 수동 변경이 아니라 Terraform으로 관리한다.
- UI 작업은 `docs/design.md`의 색상, 간격, 카드, 사이드바 규칙을 따른다.

## 3. 담당 도메인

- 동현: Auth / Login / OAuth Signup / Workspace / Dashboard / Canvas
- 주형: Task / GitHub / Progress
- 진호: Meeting / Voice / Report
- 은재: Code Review Room / PR Analysis
- 세인: Agent Runtime / Orchestrator / Planning

## 4. 작업 위치

- Frontend route: `apps/frontend/app/(workspace)/<domain>`
- Frontend component: `apps/frontend/components/<domain>`
- App Server module: `apps/app-server/src/modules/<domain>`
- App Server public adapter: `apps/app-server/src/modules/<domain>/public`
- Realtime Server: `apps/realtime-server/src/<domain>`
- AI Worker workflow: `apps/ai-worker/app/workflows/<domain>`
- 공통 코드는 두 도메인 이상에서 필요할 때만 `shared` 또는 `common`으로 올린다.
- `docs/db/pilo_erd_schema.sql`은 넓은 SQL baseline이고, `apps/app-server/prisma/schema.prisma`는 현재 Prisma-backed runtime subset이다. SQL table 존재만으로 Current Runtime API가 생기지 않는다.

## 5. 조심할 공유 영역

- 의존성/lock 파일: `apps/*/package*.json`, `apps/ai-worker/requirements*.txt`
- 공통 코드: `apps/*/src/common`, `apps/frontend/src/shared`
- CI/CD: `.github/workflows`
- AWS/Terraform 관련 파일
- 계약 문서: `docs/contracts`
- 담당자별 구현 지시서: `docs/agents`
- 기준 문서: `docs/mvp-scope-v1.md`, `docs/domain-boundary-v1.md`, `docs/api-contract-v1.md`, `docs/db/mvp-db-schema-v1.md`
- Contract fixture: `docs/contracts/fixtures`
- GitHub PR/Issue 템플릿: `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE`

Auth/Login/Signup은 동현 담당 도메인이다. Google/GitHub 소셜 로그인, 사용자 세션, 로그아웃, 가입 진입 UX는 동현이 소유한다. GitHub Repository 연동, Issue/PR 조회 권한은 주형의 GitHub 연동 도메인으로 분리한다.

## 6. 디자인 규칙

- PILO는 장식적인 랜딩보다 반복 사용에 맞춘 SaaS 운영 툴처럼 만든다.
- 기본 구조는 248px 사이드바, 74px topbar, 1204px max-width workspace다.
- 핵심 색상은 ink `#0f1422`, bg `#eceef3`, primary `#6d5bd6`, primary2 `#8b5cf6`이다.
- 상태색은 success `#2e9e5b`, warning `#d9941f`, danger `#e5484d`만 우선 사용한다.
- 카드 radius는 14px~16px, 간격은 14px~16px, border는 `#e4e7ee`를 기준으로 한다.
- 기본 폰트는 Pretendard/system sans-serif, 숫자와 타이머는 monospace를 사용한다.
- 상세 화면이 준비되기 전에는 메뉴, 카드, CTA를 내부 이동 링크로 만들지 않는다.

## 7. Git 작업 규칙

- Issue, Branch, PR, Commit 형식은 `docs/convention.md`를 따른다.
- 작업 브랜치는 `temp-dev`에서 만들고 PR 대상도 `temp-dev`로 한다.
- PR 제목이나 본문에는 담당자와 도메인을 표시한다. 예: `[주형][task] Task 생성 API`
- PR 본문에는 자동 종료 형식인 `Closes #<issue-number>`를 적는다.

## 8. 작업 전 체크

- 내 담당 도메인이 무엇인지 확인했는가?
- 다른 도메인 파일을 수정하지 않아도 되는가?
- 계약 문서가 먼저 필요한 변경인가?
- DB 변경, Agent action 변경, CI 영향 범위를 확인했는가?
