# GitHub 탐색 상태와 활성 Board 상태 분리 설계

## 목적

GitHub 설정 화면에서 repository/ProjectV2를 둘러보는 상태와
`GET /boards/active` 및 성공한 `PUT /boards/active`가 나타내는 활성 Board 상태를
서로 다른 source of truth로 관리한다.

repository를 선택해 첫 ProjectV2가 탐색 후보가 되더라도 활성화 요청이 성공하기
전에는 현재 Board로 표시하지 않는다. 활성화 실패와 요청 중 탐색 변경에도 기존
활성 Board 표시는 유지한다.

## 범위

- `apps/frontend/src/features/github-integration/` 도메인 내부 상태, UI prop, utility
- 기존 Active Board API client 응답 타입 정합성
- GitHub Integration 도메인 폴더 아래 회귀 테스트

API endpoint/request/response, DB schema, Frontend 공통 영역은 변경하지 않는다.

## 고려한 접근

### 1. 단일 selected 상태 유지 후 플래그 추가

기존 `selectedRepositoryId`와 `selectedProjectV2Id`에 활성화 여부 플래그만 추가한다.
변경량은 작지만 검색, 복원, 실패, race에서 pair의 출처가 다시 섞이기 쉽다.

### 2. browsing pair와 active source 분리

탐색에는 repository/ProjectV2 ID pair를 사용하고, 활성 상태에는
`GithubActiveBoardSource | null`을 사용한다. API 계약과 UI 책임이 명확하고
성공/실패/race를 독립적으로 처리할 수 있어 이 접근을 선택한다.

### 3. 활성화 성공 후 GET 재조회

PUT 성공 뒤 GET을 한 번 더 호출해 활성 상태를 복원할 수 있다. 그러나 불필요한
요청이 추가되고, PUT 계약이 이미 전체 active source를 반환하므로 사용하지 않는다.

## 상태 경계

`GithubPanel`은 다음 상태를 별도로 소유한다.

- `browsingRepositoryId`: 현재 탐색 및 repository/full 수동 sync 대상
- `browsingProjectV2Id`: 현재 탐색 및 ProjectV2 범위 수동 sync 대상
- `activeBoardSource`: 서버에서 복원했거나 활성화 성공 응답으로 받은 현재 Board

repository 탐색과 ProjectV2 fallback은 browsing pair만 변경한다.
활성 Board UI는 `activeBoardSource`만 소비한다.

## 데이터 흐름

### 초기 진입과 새로고침

1. GitHub snapshot과 `GET /boards/active`를 함께 조회한다.
2. GET 결과를 그대로 `activeBoardSource`에 저장한다.
3. 첫 진입 시에는 active pair를 browsing 초기값으로 사용할 수 있다.
4. 사용자가 이미 탐색 중이면 refresh는 browsing pair를 보존한다.
5. 검색/페이지 변경으로 browsing이 명시적으로 비워졌다면 active pair가 다시
   browsing을 덮어쓰지 않는다.
6. active repository가 현재 페이지 밖에 있어도 active source 표시는 유지하고,
   초기 복원에 필요한 repository metadata만 기존 상세 endpoint로 조회한다.

### repository/ProjectV2 탐색

1. repository 선택은 browsing repository를 변경한다.
2. 연결된 ProjectV2 목록을 조회하고 첫 유효 ProjectV2를 browsing 후보로 선택한다.
3. 이 과정에서는 `activeBoardSource`를 변경하지 않는다.

### 활성 Board 변경

1. 요청 직전에 browsing repository ID와 선택한 ProjectV2 ID를 캡처한다.
2. 캡처한 pair로 `PUT /boards/active`를 호출한다.
3. 성공하면 응답 `GithubActiveBoardSource`를 active source로 저장한다.
4. 실패하면 active source를 변경하지 않는다.
5. 요청 중 다른 repository를 탐색해도 성공 결과는 PUT 응답의 pair에 귀속되고,
   현재 browsing pair는 덮어쓰지 않는다.

### 수동 sync

- `project_v2`, `project_v2_fields`, `project_v2_items`는 browsing pair를 사용한다.
- `full`은 browsing repository를 사용하고 browsing ProjectV2를 payload에 넣지 않는다.
- `source`는 기존 installation 범위를 유지한다.
- sync 시작/완료는 browsing pair와 active source를 변경하지 않는다.

## UI 경계

`GithubConnectLayout`은 browsing prop과 active source prop을 구분해 전달한다.

`GithubConnectProject`는 다음 규칙으로 표시한다.

- 상단 현재 활성 Board: `activeBoardSource`에서 직접 렌더링
- 목록의 `현재 Board` 표시: active repository ID와 active project ID가 모두
  browsing 목록의 항목과 일치할 때만 표시
- active source가 null이면 browsing 후보가 있어도 현재 Board로 표시하지 않음

## 모듈화

pair 선택과 비교 규칙은 `utils/github-project-selection.ts`에 순수 함수로 둔다.
React component는 API orchestration과 상태 연결만 담당한다.

기존 `GithubActiveBoardSource` 타입을 재사용한다. API client의 PUT 반환 타입은
계약에 맞게 이 타입으로 넓히며 새 도메인 타입은 만들지 않는다.

## 오류 처리

- ProjectV2 목록 조회 실패: browsing 결과만 실패 처리하고 active source는 보존
- 활성화 실패: 기존 active source 보존, dialog/action error 표시
- stale snapshot 응답: 기존 request gate로 상태 반영 차단
- 활성화 중 탐색 변경: 캡처한 요청 pair 및 PUT 응답으로 active source 갱신

## 테스트

새 회귀 테스트는 공통 테스트 러너가 아닌
`apps/frontend/src/features/github-integration/` 아래에 둔다.

필수 시나리오:

1. active source가 없을 때 첫 ProjectV2 fallback은 browsing만 변경
2. GET으로 복원한 active pair와 browsing pair의 독립성
3. PUT 성공 시 응답 pair만 active source로 반영
4. PUT 실패 시 기존 active source 유지
5. PUT 진행 중 repository 변경 시 browsing 보존 및 요청 pair 귀속
6. 검색/페이지 변경과 off-page active repository 복원
7. ProjectV2 sync payload는 browsing pair 사용
8. source/full sync는 browsing/active 상태를 변경하지 않음

검증 명령:

```text
cd apps/frontend
node --experimental-strip-types src/features/github-integration/active-board-selection-persistence.test.mjs
node scripts/github-integration/test.mjs
npm test
npm run lint
npm run format:check
npm run build
```

## 영향 범위

- API 계약 변경: 없음
- DB schema 변경: 없음
- Frontend 공통 영역 변경: 없음
- App Server 변경: 없음
- 다른 도메인 영향: Board 활성 source를 GitHub 설정에서 표시·변경하는 흐름

#1755 webhook 처리 파일 및 #1756 App Server/DB snapshot 파일과 직접 겹치지 않는다.
다만 #1756 병합 후 활성 Board PUT에서 이어지는 Board hydration 흐름을 통합 확인한다.
