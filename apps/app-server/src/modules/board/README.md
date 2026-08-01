# Board Module

Owner: 주형

API contract: `docs/api/board-api.md`
([link](../../../../../docs/api/board-api.md))

이 모듈은 GitHub ProjectV2 기반 Board cache와 제한된 issue write API를 소유한다.
GitHub Integration이 동기화한 repository/ProjectV2/issue source cache를 읽어
`boards`, `board_columns`, `pilo_issues` read model을 hydrate하고, Board 화면에서
필요한 issue 생성, status 이동, issue title/body/state/assignee 수정을 처리한다.

## 책임

- active Board source 조회/변경과 `workspace_board_settings.active_board_id` pointer 관리
- repository/ProjectV2 조합의 Board hydrate와 Board/column/issue/filter read API
- Board issue detail과 issue 관련 PR 목록 조회
- Board issue 생성: GitHub Issue 생성, ProjectV2 item 추가, Status 설정, local cache 저장
- Board issue status 이동: ProjectV2 Status field write, stale move 감지, local cache 갱신
- Board issue title/body/state/assignees 수정과 assignee 후보 조회
- Board issue create idempotency ledger, retry checkpoint, safe error 저장
- Board invalidation/source update Redis publish
- Agent/Meeting 내부 호출을 위한 delivery option 조회와 issue create input 검증

## 책임이 아닌 것

- GitHub repository/issue/PR/ProjectV2 source sync, OAuth token 복호화, provider adapter 구현은
  [GitHub Integration Module](../github-integration/README.md)이 소유한다.
- Board kanban frontend와 realtime reconnect UX는
  [Board Feature](../../../../frontend/src/features/board/README.md)가 소유한다.
- GitHub 연결 설정 frontend는
  [GitHub Integration Feature](../../../../frontend/src/features/github-integration/README.md)가
  소유한다.
- Socket.IO server room membership과 Redis fan-out은 Realtime Server가 소유한다.
- ProjectV2 field/option 생성/수정, issue delete, comments, labels 직접 변경, milestone 변경,
  PR merge/close는 현재 Board API 범위가 아니다.

## 구조와 데이터 흐름

```text
board.controller.ts
  -> board.service.ts
     -> active-board-source.service.ts
     -> board-hydration.service.ts
     -> board-read.service.ts
     -> board-issue-read.service.ts
     -> board-issue-create.service.ts
     -> board-issue-status.service.ts
     -> board-issue-update.service.ts
     -> board-issue-assignee.service.ts
     -> queries/*.queries.ts
```

1. Controller는 `@Controller("workspaces/:workspaceId/boards")`와 `AuthGuard`로 모든 Board
   REST endpoint를 보호한다.
2. 모든 public method는 `WorkspaceService.assertWorkspaceAccess()`로 workspace membership을
   검증한다. active Board source 변경은 추가로 workspace owner만 허용한다.
3. Board hydrate는 `github_project_v2_repositories` link를 검증하고 DB function
   `hydrate_pilo_board_from_github(projectV2Id, repositoryId)`를 호출한다.
4. active source 변경은 transaction-scoped advisory lock 안에서 ProjectV2 selection 교체,
   Board hydrate, source pointer upsert를 함께 처리한다. 실패하면 이전 source가 보존된다.
5. issue create는 idempotency operation을 claim한 뒤 GitHub Issue 생성, ProjectV2 item 추가,
   Status 설정, cache 저장 checkpoint 순서로 진행한다.
6. status 이동은 advisory lock으로 같은 issue 이동을 직렬화하고, `previousColumnId`와 현재
   cache column이 다르면 GitHub write 없이 `409`를 반환한다.
7. GitHub write 성공 뒤 local cache를 갱신한다. local cache 실패는 다음 hydrate/refresh에서
   GitHub source of truth로 복구되어야 한다.

## 중요한 파일

- [board.controller.ts](board.controller.ts): Board public endpoint와 status code.
- [board.service.ts](board.service.ts): module facade, 내부 Agent surface, module info.
- [active-board-source.service.ts](active-board-source.service.ts): active Board source transaction,
  owner check, source update publish.
- [board-hydration.service.ts](board-hydration.service.ts): Board 생성/hydrate와
  `hydrate_pilo_board_from_github` 호출.
- [board-read.service.ts](board-read.service.ts): Board/column/issue/filter read orchestration.
- [board-issue-read.service.ts](board-issue-read.service.ts): issue detail, related PR,
  filter options.
- [board-issue-create.service.ts](board-issue-create.service.ts): issue create workflow와
  checkpoint replay.
- [board-issue-create-operation.service.ts](board-issue-create-operation.service.ts):
  `Idempotency-Key` ledger, lease, retryable/succeeded 상태.
- [board-issue-status.service.ts](board-issue-status.service.ts): ProjectV2 Status 이동과
  stale move conflict.
- [board-issue-update.service.ts](board-issue-update.service.ts): title/body/state/assignee 수정.
- [board-issue-assignee.service.ts](board-issue-assignee.service.ts): assignable user 조회.
- [board-invalidation-publisher.service.ts](board-invalidation-publisher.service.ts):
  `board:invalidations` publish.
- [board-source-publisher.service.ts](board-source-publisher.service.ts):
  `board:source-events` publish.
- [board-issue-create-target.ts](board-issue-create-target.ts): issue create 대상 eligibility.
- [queries/](queries): Board SQL ownership boundary.
- [types/index.ts](types/index.ts), [dto/](dto): public payload/input shape.

## Public API surface

전체 endpoint와 payload는 [Board API](../../../../../docs/api/board-api.md)를 따른다. 이 module의
public controller surface는 active source, Board hydrate/read, column read, issue list/detail,
issue create, status move, issue update, assignee options, related PR, filter options 그룹으로
나뉜다.

내부 surface:

- `BoardService.listBoardDeliveryOptions()`: Meeting/Agent delivery target 선택 목록.
- `BoardService.validateBoardIssueCreateInput()`: 내부 handoff 전 동일 target/input 검증.
- `BoardService.updateBoardIssueAssigneesDelta()`: Agent mutation. public PATCH는 전체 assignee
  list replacement 계약을 유지한다.
- `BoardService.getModuleInfo()`: `{ domain: "board", apiContract: "docs/api/board-api.md" }`.

## GitHub write 경계

Board API는 ProjectV2 write를 전부 제외하지 않는다. 현재 구현과 API 계약이 허용하는 write는
다음으로 제한된다.

- issue create: `purpose=project_v2` token으로 GitHub repository issue를 만들고 ProjectV2 item과
  Status를 설정한다.
- status 이동: `purpose=project_v2` token으로 기존 ProjectV2 item의 Status field value를
  변경하거나 Unmapped 이동 시 clear한다.
- issue 수정/assignee 조회: `purpose=app_user` token으로 repository issue title/body/state/assignee
  변경과 assignable user 조회를 수행한다.

ProjectV2 field/option 생성/수정, arbitrary ProjectV2 item write, label/comment/milestone 직접
변경은 Board API 범위가 아니다.

## 설정과 환경 변수

이 모듈이 직접 또는 의존 service를 통해 필요로 하는 주요 env는 다음이다.

- `DATABASE_URL`
- `DATABASE_SSL`
- `DATABASE_POOL_MAX`
- `DATABASE_POOL_IDLE_TIMEOUT_MS`
- `DATABASE_POOL_CONNECTION_TIMEOUT_MS`
- `DATABASE_APPLICATION_NAME`
- `REDIS_URL`
- `GITHUB_USER_OAUTH_CLIENT_ID`
- `GITHUB_USER_OAUTH_CLIENT_SECRET`
- `GITHUB_PROJECT_OAUTH_CLIENT_ID`
- `GITHUB_PROJECT_OAUTH_CLIENT_SECRET`
- `GITHUB_TOKEN_ENCRYPTION_KEY`
- `GITHUB_APP_ID`
- `GITHUB_APP_SLUG`
- `GITHUB_APP_PRIVATE_KEY`
- `SESSION_SECRET`
- `PORT`

로컬 예시는 [/.env.example](../../../../../.env.example)에 있다. 실제 token, OAuth code,
private key, connection string secret은 README나 test fixture에 넣지 않는다.
env 파일은 App Server가 자동으로 로드하지 않으며 실행 환경에서 export/inject해야 한다.
`src/main.ts`의 기본 port는 `3000`이지만 root env 예시는 App Server origin을
`http://localhost:4000`으로 둔다. 로컬에서 예시 origin을 쓰려면 `PORT=4000`을 명시한다.

## 실행과 검증 명령

[apps/app-server/package.json](../../../package.json)의 script 기준이다.

```bash
npm run build
npm run lint
npm run test
npm run format:check
npm run start
```

`npm run test`는 `pretest`로 build를 먼저 실행한다. Board module 전용 테스트 묶음은 package
test 내부에서 [scripts/board/test.mjs](../../../scripts/board/test.mjs)가 호출하는 구조다.

## 지원 workflow

- active Board source 조회/변경: `GET/PUT /boards/active`. `PUT`은 owner-only이고, selection,
  hydrate, pointer commit이 함께 성공해야 한다.
- Board hydrate: repository와 ProjectV2 link가 같은 workspace에 있어야 한다. 새 board는 `201`,
  기존 board refresh는 `200`을 반환한다.
- Board read: 마지막 성공 cache를 반환할 수 있다. GitHub sync 실패나 진행 중 상태만으로 read를
  막지 않는다.
- issue create: `Idempotency-Key`가 필수이고 같은 key/request 성공 replay는 기존 성공 응답을
  `201`로 반환한다.
- status 이동: `previousColumnId` stale guard를 지원하며, 같은 column 이동은 activity log를 남기지
  않는다.
- issue 수정: title/body/state/assignees 중 하나 이상이 필요하다. assignees는 전체 교체이며
  최대 10개다.
- assignee 후보: 현재 issue repository의 assignable user를 GitHub App user OAuth로 조회한다.
- related PR: GitHub API를 호출하지 않고 동기화된 `github_pull_requests` cache를 검색한다.

## 실패와 보안 caveat

- issue create operation은 GitHub Issue 생성, ProjectV2 item 추가, Status 변경, cache 저장
  checkpoint를 저장한다. retryable 상태나 만료된 processing lease는 마지막 checkpoint부터
  이어서 처리한다.
- GitHub Issue 생성 응답을 받지 못한 경우 원격 Issue 식별자를 저장할 수 없으므로 checkpoint
  복구 범위에 포함하지 않는다.
- operation에는 provider raw error, token, secret을 저장하지 않고 safe code/message만 저장한다.
- 같은 idempotency key의 다른 request는 `409`이고, active processing lease가 있으면 `409`다.
- issue create 대상은 repository와 ProjectV2가 같은 active installation에 연결되어 있어야 한다.
  installation 삭제로 분리됐거나 서로 다른 installation을 가리키면 생성 대상에서 제외한다.
- Board issue status 이동에서 `previousColumnId`가 현재 cache와 다르면 GitHub write 없이 `409`를
  반환한다.
- GitHub OAuth refresh 불가 또는 401은 `400` 재연결 오류를 보존한다. 이 오류를 generic
  `502 BAD_GATEWAY`로 감싸지 않는다.
- provider write 실패는 safe `502 BAD_GATEWAY` 메시지로 매핑한다. GitHub raw response, token,
  secret은 응답/로그/operation ledger에 노출하지 않는다.
- Redis invalidation publish 실패는 Board mutation 성공을 되돌리지 않는다. frontend는 수동 refresh
  또는 다음 hydrate/invalidation으로 수렴해야 한다.
- Board content event는 `board:invalidated`이며 payload는 최소 식별자만 포함한다. raw GitHub
  payload와 issue detail은 socket으로 보내지 않는다.

## 관련 문서

- [Board Feature](../../../../frontend/src/features/board/README.md)
- [GitHub Integration Feature](../../../../frontend/src/features/github-integration/README.md)
- [GitHub Integration Module](../github-integration/README.md)
- [Board API](../../../../../docs/api/board-api.md)
- [GitHub Integration API](../../../../../docs/api/github-integration-api.md)
- [Realtime Server](../../../../realtime-server/README.md)
