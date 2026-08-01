# Board Feature

Owner: 주형

API contract: `docs/api/board-api.md`
([link](../../../../../docs/api/board-api.md))

이 폴더는 GitHub ProjectV2 기반 Kanban Board 화면을 소유한다. 활성 Board source를
읽고, Board/column/card snapshot을 REST로 조회하며, issue 생성, status 이동, issue
상세/수정, 필터, Board realtime invalidation 대응을 구현한다.

## 책임

- Board route의 실제 화면 entry point와 Kanban presentation
- active Board source 조회 후 해당 board를 선택하는 frontend 상태 관리
- Board, column, issue, filter option, issue detail, 관련 PR 목록 조회
- issue 생성 요청과 `Idempotency-Key` 유지/초기화
- drag/drop status 이동의 optimistic update, `previousColumnId` stale move 방지, 실패 시
  rollback과 refresh
- `board:invalidated`, `board:source:updated`, reconnect 시 REST snapshot 재조회
- Board workspace location adapter와 issue sheet deep-link 처리

## 책임이 아닌 것

- GitHub 연결 설정, OAuth/App installation, repository/ProjectV2 discovery, manual sync UI는
  [GitHub Integration Feature](../github-integration/README.md)가 소유한다.
- Board cache hydrate, GitHub issue write, ProjectV2 status mutation, idempotency ledger는
  [App Server Board Module](../../../../app-server/src/modules/board/README.md)이 소유한다.
- GitHub token 복호화와 provider adapter는
  [App Server GitHub Integration Module](../../../../app-server/src/modules/github-integration/README.md)이
  소유한다.
- Socket.IO membership/access check와 Redis fan-out은 Realtime Server가 소유한다.

## 구조와 데이터 흐름

```text
page.tsx
  -> components/board-panel.tsx
     -> hooks/use-board-workspace-data.ts
        -> api/client.ts
           -> /api/v1/workspaces/{workspaceId}/boards/*
           -> /api/v1/workspaces/{workspaceId}/github/repositories
           -> /api/v1/workspaces/{workspaceId}/github/projects-v2
     -> realtime/use-board-realtime.ts
        -> realtime/board-realtime-lifecycle.ts
           -> Socket.IO board rooms
```

1. `BoardPanel`은 auth session에서 workspace와 access token을 읽고
   `useBoardWorkspaceData()`를 호출한다.
2. hook은 catalog(`repositories`, `projects`, `boards`, `activeSource`)와 selected board
   snapshot(`board`, `columns`, `issues`, `filterOptions`)을 분리해서 관리한다.
3. issue 목록은 `loadAllBoardIssuePages()`로 100개 단위 페이지를 모두 읽고, 첫 페이지를
   먼저 publish해 초기 표시를 빠르게 한다.
4. status 이동은 로컬 optimistic update를 적용한 뒤 `PATCH /status`를 호출한다. 실패하면
   이전 snapshot으로 되돌리고 `refreshBoard()`를 수행한다.
5. realtime event는 payload를 state에 merge하지 않는다. 현재 board와 workspace가 일치하면
   기존 REST API를 다시 호출해 snapshot을 교체한다.

## 중요한 파일

- [page.tsx](page.tsx): route entry point.
- [components/board-panel.tsx](components/board-panel.tsx): Board 화면 상태, 필터, issue sheet,
  create dialog, status 이동 handler.
- [components/board-kanban.tsx](components/board-kanban.tsx): column/card Kanban presentation과
  drag/drop 입력.
- [components/board-issue-create-dialog.tsx](components/board-issue-create-dialog.tsx):
  issue 생성 dialog.
- [components/board-issue-create-form.tsx](components/board-issue-create-form.tsx):
  idempotency key 보존과 성공 후 초기화.
- [components/board-issue-sheet.tsx](components/board-issue-sheet.tsx): issue 상세, 수정,
  담당자 후보, 관련 PR 조회.
- [api/client.ts](api/client.ts): Board REST client와 일부 GitHub source read wrapper.
- [hooks/use-board-workspace-data.ts](hooks/use-board-workspace-data.ts): catalog/board snapshot,
  mutation, background refresh orchestration.
- [realtime/board-realtime-lifecycle.ts](realtime/board-realtime-lifecycle.ts): reconnect, room
  join/leave, invalidation coalescing.
- [utils/board-request-coordinator.ts](utils/board-request-coordinator.ts): stale response와
  mutation 중 background response 처리.
- [utils/board-issue-create-idempotency.ts](utils/board-issue-create-idempotency.ts): create form
  idempotency key 생성/재사용.
- [types/index.ts](types/index.ts): Board API payload와 command 타입.

## Public surface

이 feature가 외부로 제공하는 안정 surface는 다음이다.

- `BoardPage`, `BoardPanel`
- `createBoardApiClient({ accessToken, baseUrl, fetcher })`
- `BoardApiError`
- `useBoardWorkspaceData()`
- `useBoardRealtime()`
- `boardNavigation`
- Board payload/input 타입(`BoardPayload`, `BoardIssueCardPayload`,
  `CreateBoardIssueCommand`, `UpdateBoardIssueStatusInput` 등)

`api/client.ts`는 `NEXT_PUBLIC_PILO_APP_SERVER_URL`을 origin으로 읽고 `/api/v1`을 한 번만
붙인다. Board REST 호출은 bearer token을 `Authorization` header로 보낸다. GitHub
repository/ProjectV2 catalog wrapper는 cookie 기반 callback flow와 맞추기 위해 요청별로
`credentials: "include"`를 붙인다.

## API 사용 범위

전체 endpoint, request, response, status code는
[Board API](../../../../../docs/api/board-api.md)를 따른다. 이 feature는 active source,
Board/column/issue/filter read, issue create, issue status update, issue update,
assignee option, related PR 조회 client wrapper를 호출한다.

Catalog 로딩에는 GitHub Integration source read endpoint도 사용한다. repository/ProjectV2
조회 계약은 [GitHub Integration API](../../../../../docs/api/github-integration-api.md)를 따른다.

## Realtime

Board realtime 계약은 [Board API의 Board Realtime](../../../../../docs/api/board-api.md#board-realtime)과
[Realtime Server](../../../../realtime-server/README.md)를 따른다.

- client -> `board:join` `{ workspaceId, boardId }`
- client -> `board:leave` `{ workspaceId, boardId }`
- client -> `board:source:join` `{ workspaceId }`
- client -> `board:source:leave` `{ workspaceId }`
- server -> `board:invalidated` `{ workspaceId, boardId, updatedAt }`
- server -> `board:source:updated` `{ workspaceId, boardId, changedAt }`
- server -> `board:error`

`board:invalidated`는 card payload가 아니라 invalidation signal이다. frontend는 socket payload로
card/column state를 직접 patch하지 않고 `refreshBoard()`를 호출한다. reconnect 때도 Board room과
source room에 다시 join하고 active source와 Board snapshot을 다시 읽는다.

## 설정과 환경 변수

Frontend에서 이 폴더가 직접 읽는 값은 다음이다.

- `NEXT_PUBLIC_PILO_APP_SERVER_URL`: App Server origin. 없으면 `http://localhost:4000`.
- `NEXT_PUBLIC_PILO_REALTIME_SERVER_URL`: Socket.IO Realtime Server URL. production에서 없으면
  realtime client 생성이 실패한다.

Board issue 생성/status write가 실제로 성공하려면 server 쪽 GitHub 설정도 필요하다.

- `GITHUB_PROJECT_OAUTH_CLIENT_ID`
- `GITHUB_PROJECT_OAUTH_CLIENT_SECRET`
- `GITHUB_USER_OAUTH_CLIENT_ID`
- `GITHUB_USER_OAUTH_CLIENT_SECRET`
- `GITHUB_TOKEN_ENCRYPTION_KEY`
- `REDIS_URL`
- `DATABASE_URL`

로컬 예시는 [/.env.example](../../../../../.env.example)에 있다.
env 파일은 각 프로세스에 자동으로 로드되지 않으므로 실행 방식에 맞게 export/inject해야 한다.
Realtime Server source의 기본 `PORT`는 `3001`이지만 root env 예시는
`NEXT_PUBLIC_PILO_REALTIME_SERVER_URL=http://localhost:4001`이다. 예시 URL을 쓰려면
Realtime Server 프로세스에 `PORT=4001`을 명시한다.

## 실행과 검증 명령

[apps/frontend/package.json](../../../package.json)의 script 기준이다.

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run format:check
```

Board 변경을 좁게 볼 때는 package script인 `npm run test`가 전체 frontend 테스트 묶음을
실행한다. 현재 feature 전용 `.test.mjs` 파일들은 `src/features/board` 아래에 있고,
Board realtime, request coordinator, issue idempotency, active source, load pagination,
presentation, workspace location을 검증한다.

## 지원 workflow

- active Board 보기: `/boards/active`로 source를 읽고, 해당 `boardId`의 detail/columns/issues를
  로드한다.
- Board snapshot refresh: toolbar refresh, realtime invalidation, issue sheet update 후
  REST snapshot을 다시 읽는다.
- issue 생성: dialog에서 `CreateBoardIssueCommand`를 만들고 `Idempotency-Key` header로 보낸다.
  성공하면 issue list와 column count를 업데이트하고 sheet를 연다.
- status 이동: 현재 column을 `previousColumnId`로 보내 stale move를 서버에서 감지한다.
- issue 수정: sheet에서 title/body/state/assignees를 수정하고 성공 후 Board snapshot을 다시
  읽는다.
- 필터: state, assignee, label, search query를 `GET /issues` query로 보낸다.

## 실패와 보안 caveat

- issue 생성 key는 failed submission에서 유지되고 성공 후 `null`로 초기화된다. 같은 key의
  성공 replay는 같은 issue를 반환해야 하므로 form 상태를 임의로 새 key로 바꾸지 않는다.
- status 이동 실패 시 optimistic state를 이전 snapshot으로 되돌리고 REST refresh를 수행한다.
- `previousColumnId`가 서버 cache와 다르면 `409`가 반환되며 GitHub write는 수행되지 않는다.
- Board issue create와 status 이동은 ProjectV2 OAuth(`purpose=project_v2`)가 필요하다.
  `project`와 `repo` scope가 모두 있어야 한다.
- issue title/body/state/assignee 수정과 assignee 후보 조회는 App user OAuth(`purpose=app_user`)가
  필요하다.
- GitHub provider raw error, token, secret은 frontend 메시지로 표시하지 않는다. API가 반환한
  safe message만 사용한다.
- Board는 `github:source:invalidated`를 구독하지 않는다. GitHub source 변경은 서버 hydrate 후
  `board:invalidated`로 한 번만 반영한다.

## 관련 문서

- [GitHub Integration Feature](../github-integration/README.md)
- [App Server GitHub Integration Module](../../../../app-server/src/modules/github-integration/README.md)
- [App Server Board Module](../../../../app-server/src/modules/board/README.md)
- [Board API](../../../../../docs/api/board-api.md)
- [GitHub Integration API](../../../../../docs/api/github-integration-api.md)
- [Realtime Server](../../../../realtime-server/README.md)
