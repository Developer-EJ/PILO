# PILO Agent 작업 시작 가이드

이 문서는 모든 Agent가 작업을 시작할 때 가장 먼저 읽는 요약 규칙이다.
## 1. 먼저 읽을 문서

- `docs/convention.md`: Issue, Branch, PR, Commit 규칙
- `docs/agent-collaboration-guide.md`: 도메인 소유권, 폴더 구조, 충돌 방지
- `docs/contracts/contract-change-rules.md`: contract 변경, 리뷰, self-approve 규칙
- `docs/infra/ci.md`: CI, required checks, branch protection
- `docs/PILO_5인_분업_상세_명세.md`: 5인 분업과 기능 책임
## 2. 핵심 원칙

- 서버 단위가 아니라 도메인 단위로 작업한다.
- 자기 도메인 밖의 파일은 필요한 이유가 명확할 때만 수정한다.
- 다른 도메인의 DB 모델, service, repository를 직접 수정하지 않는다.
- 도메인 간 연동은 API, event, read model, contract로 처리한다.
- 계약 변경은 구현보다 먼저 `docs/contracts/*.md`에 반영한다.
- AWS 작업은 콘솔 수동 변경이 아니라 Terraform으로 관리한다.
## 3. 담당 도메인

- A: Workspace / Dashboard / Canvas
- B: Task / GitHub / Progress
- C: Meeting / Voice / Report
- D: Code Review Room / PR Analysis
- E: Agent Runtime / Orchestrator / Planning
## 4. 작업 위치

- Frontend: `apps/frontend/src/domains/<domain>`
- App Server: `apps/app-server/src/domains/<domain>`
- Realtime Server: `apps/realtime-server/src/domains/<domain>`
- AI Worker: `apps/ai-worker/app/domains/<domain>`
- 공통 코드는 두 도메인 이상에서 필요할 때만 `shared` 또는 `common`으로 올린다.
## 5. 조심할 공유 영역

- `apps/*/package.json`
- `apps/*/package-lock.json`
- `apps/ai-worker/requirements*.txt`
- `apps/*/src/common`
- `apps/frontend/src/shared`
- `.github/workflows`
- Terraform 관련 파일
- `docs/contracts`
## 6. Git 작업 규칙

- Issue, Branch, PR, Commit 형식은 `docs/convention.md`를 따른다.
- 작업 브랜치는 `dev`에서 만든다.
- PR 대상은 `dev`다.
- PR 제목이나 본문에는 담당자와 도메인을 표시한다. 예: `[B][task] Task 생성 API`
- PR 본문에는 관련 Issue close 문구를 적는다.
## 7. 작업 전 체크

- 내 담당 도메인이 무엇인지 확인했는가?
- 다른 도메인 파일을 수정하지 않아도 되는가?
- 계약 문서가 먼저 필요한 변경인가?
- DB 변경 또는 Agent action 변경이 있는가?
- CI가 요구하는 테스트, lint, build 범위를 확인했는가?
