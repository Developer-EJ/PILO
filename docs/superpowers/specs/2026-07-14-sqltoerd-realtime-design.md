# SQLtoERD 동시 편집 realtime 설계

> 상태: 설계 확정용 문서. 이 문서는 API·DB·socket 동작을 아직 변경하지 않으며, 실제 구현은 아래에 나눈 후속 Issue/PR에서 진행한다.

## 목표

같은 Workspace의 같은 SQLtoERD session을 여러 사용자가 열었을 때, 누가 접속했고 어디를 보고 있는지 즉시 알 수 있게 한다. 이후 table 위치와 `layoutJson.annotations` 변경은 한 사용자의 저장이 다른 사용자의 변경을 덮어쓰지 않도록 operation 단위로 동기화한다.

SQL 원문은 처음부터 CRDT로 병합하지 않는다. Phase 1에서는 한 명만 SQL 원문을 편집할 수 있는 임대(lease) 잠금을 사용하고, 잠금 소유자가 저장·재생성한 결과를 canonical snapshot으로 다른 사용자가 받게 한다.

## 확인한 현재 제약

- SQLtoERD session의 canonical REST API는 `PATCH /workspaces/{workspaceId}/sql-erd-sessions/{sessionId}`이며, 현재 `revision`을 기준으로 전체 session payload autosave 충돌을 감지한다.
- 현재 realtime-server의 Canvas room은 `canvas` 테이블 존재 여부까지 확인하는 Canvas 전용 접근 규칙이다. SQLtoERD session에 그대로 join하면 접근 검증을 통과하지 못한다.
- Canvas realtime 모듈은 cursor·selection·editing intent presence만 전달하며, 영속 shape operation log나 CRDT를 책임지지 않는다.

따라서 Canvas의 socket 인증, room lifecycle, presence 전달 패턴은 재사용하되, SQLtoERD의 접근 검증·room·operation 계약은 별도로 둔다.

## 범위

### 포함

- 같은 `workspaceId`와 `sessionId`를 기준으로 한 SQLtoERD realtime room
- 접속자, cursor, selection, 현재 도구의 비영속 presence
- table layout과 모든 annotation(`links`, `notes`, `frames`, `texts`, `strokes`)의 영속 operation 동기화
- 재연결, 늦은 join, operation 누락에 대한 catch-up 및 canonical snapshot 복구
- SQL 원문/모델 재생성에 대한 단일 편집자 lease 잠금

### 제외

- Yjs, CRDT, character-level SQL 동시 병합
- Canvas의 자유 shape API 또는 Canvas room을 SQLtoERD session에 연결하는 작업
- 장기 presence 저장, remote cursor 녹화, version history UI
- 기존 autosave·annotation·camera 관련 버그 수정

## 권한과 room

room의 식별자는 다음과 같이 고정한다.

```text
workspace:{workspaceId}:sql-erd:{sessionId}
```

`sql-erd:join`을 처리할 때 realtime-server는 bearer token의 사용자와 `workspace_members`를 확인하고, 다음 조건을 모두 만족하는 활성 session만 join시킨다.

```sql
SELECT s.id
FROM sql_erd_sessions AS s
JOIN workspace_members AS wm
  ON wm.workspace_id = s.workspace_id
WHERE s.id = $1
  AND s.workspace_id = $2
  AND s.deleted_at IS NULL
  AND wm.user_id = $3;
```

권한 판단은 App Server의 Workspace 접근 규칙과 같아야 한다. SQLtoERD session을 알기만 해도 다른 Workspace room에 들어갈 수 있어서는 안 된다.

## 이벤트 계약

Socket은 실시간 전달만 담당한다. 영속 변경은 client가 먼저 App Server에 요청하고, App Server가 DB transaction을 완료한 뒤 Redis로 publish한다. realtime-server는 그 이벤트를 room에 broadcast한다.

| 방향 | 이벤트 | 용도 | 영속 여부 |
| --- | --- | --- | --- |
| client → server | `sql-erd:join` | room join과 현재 presence 수신 | 아니오 |
| client → server | `sql-erd:leave` | 명시적 room leave | 아니오 |
| client → server | `sql-erd:presence:update` | cursor, selection, tool, editing intent 갱신 | 아니오 |
| server → client | `sql-erd:joined` | room의 현재 presence와 latest operation sequence 전달 | 아니오 |
| server → client | `sql-erd:presence:update` | 다른 사용자의 presence 전달 | 아니오 |
| server → client | `sql-erd:presence:leave` | disconnect/leave 전달 | 아니오 |
| server → client | `sql-erd:operation` | App Server가 저장한 operation 전달 | 예 |
| server → client | `sql-erd:source-lock:update` | SQL 원문 lease 상태 전달 | 아니오 |
| server → client | `sql-erd:sync:required` | gap 또는 재동기화 필요 알림 | 아니오 |
| server → client | `sql-erd:error` | join·권한·payload 오류 | 아니오 |

`sql-erd:operation`은 client가 emit하지 않는다. browser가 socket으로 직접 저장을 요청하게 하면 REST validation, revision, audit와 DB transaction의 source of truth가 갈라진다.

## 영속 operation 계약

### 저장소

후속 DB migration은 `sql_erd_session_operations`를 만든다. 필수 필드는 아래와 같다.

| 필드 | 의미 |
| --- | --- |
| `id` | operation UUID |
| `workspace_id`, `session_id` | 대상 Workspace와 session |
| `op_seq` | session별 단조 증가 sequence |
| `actor_user_id` | 변경 사용자 |
| `client_operation_id` | 재시도 중복을 막는 client UUID. `(session_id, client_operation_id)` unique |
| `operation_type` | `layout_patch` 또는 `source_snapshot` |
| `base_revision`, `result_revision` | REST 저장 전후 session revision |
| `payload_json` | 검증·적용된 canonical operation payload |
| `created_at` | 발생 시각 |

`(session_id, op_seq)`는 unique여야 하며, `(session_id, op_seq)` index와 Workspace membership/RLS 규칙을 함께 둔다. sequence 발급, session update, operation insert, Redis publish 대상 생성은 하나의 App Server transaction에서 수행한다.

### mutation API 제안

현재 전체 session PATCH는 compatibility autosave로 유지한다. realtime rollout이 켜진 session의 incremental 변경은 아래의 새로운 canonical endpoint를 사용한다.

```text
POST /workspaces/{workspaceId}/sql-erd-sessions/{sessionId}/operations
GET  /workspaces/{workspaceId}/sql-erd-sessions/{sessionId}/operations?afterSeq={opSeq}&limit={limit}
```

`POST` 요청의 최소 형식은 다음과 같다.

```ts
type SubmitSqlErdOperationRequest = {
  clientOperationId: string;
  baseRevision: number;
  operation:
    | {
        type: "layout_patch";
        patch: SqlErdLayoutPatch;
      }
    | {
        type: "source_snapshot";
        sourceText: string;
        sourceFormat: "sql";
        sqlDialect: "auto" | "postgresql" | "mysql" | "sqlite";
        modelJson: SqltoerdModelJsonV1;
        layoutJson: SqltoerdLayoutJsonV1;
      };
};
```

`SqlErdLayoutPatch`는 현재 layout 전체를 다시 보내지 않는다. `tableLayoutsById`, `notesById`, `framesById`, `textsById`, `strokesById`와 각각의 `delete...Ids`를 명확히 구분한다. 빈 문자열·빈 배열·삭제를 같은 의미로 해석하지 않는다.

서버는 최신 canonical layout에 patch를 적용해 검증한 결과만 저장하고, 같은 `clientOperationId` 재시도에는 처음 저장한 결과를 돌려준다. 서로 다른 entity의 patch는 server `op_seq` 순서로 병합한다. 같은 entity를 동시에 바꾼 경우에는 더 늦게 확정된 operation이 이기며, client는 상대의 operation을 자신의 최신 상태에 다시 적용한다.

### 재연결과 catch-up

join 응답은 `latestOpSeq`와 현재 snapshot revision을 제공한다. client는 자신이 마지막으로 적용한 `opSeq` 뒤 operation을 GET으로 가져온다.

- sequence가 연속되면 순서대로 local state에 적용한다.
- operation 보존 기간을 지나거나 sequence gap이 있으면 server는 `sql-erd:sync:required`를 보내고 client는 session detail GET으로 canonical snapshot을 다시 읽는다.
- 자신의 `clientOperationId`가 echo된 경우 client는 optimistic 변경을 다시 적용하지 않고 revision/opSeq만 확정한다.

## SQL 원문 동시 편집 정책

SQL 원문, `Regenerate SQL`, SQL diff Apply는 한 session에서 동시에 병합하지 않는다. 이런 변경은 `source_snapshot`이고 model과 layout에 연쇄 영향을 주므로 Phase 1에서는 아래 lease 정책을 사용한다.

1. source 편집 시작 시 App Server의 source-lock endpoint로 30초 lease를 claim한다.
2. lock holder는 10초마다 renew한다. disconnect 또는 만료 뒤 다른 사용자가 claim할 수 있다.
3. source write endpoint는 DB의 유효 lock owner를 확인한다. realtime-server만 lock을 알고 있는 구조는 허용하지 않는다.
4. lock이 없는 사용자는 source editor와 SQL Apply를 read-only로 보고, holder의 이름과 만료 상태를 표시한다.
5. holder의 source save/reparse가 성공하면 App Server는 canonical `source_snapshot` operation을 publish한다. 다른 client는 편집 중인 local source를 갖지 않으므로 snapshot으로 교체한다.

source lock은 `sql_erd_session_source_locks(session_id primary key, owner_user_id, lease_id, expires_at, updated_at)`처럼 App Server가 검증 가능한 DB 상태로 둔다. realtime-server는 변경 알림만 broadcast한다. Redis가 잠금의 유일한 source of truth가 되면 App Server의 REST write 권한을 안전하게 검증할 수 없다.

CRDT/Yjs와 character-level merge는 source lock rollout의 안정성, 사용성, conflict telemetry를 확인한 뒤 별도 Epic으로 검토한다.

## 클라이언트 동작

- presence는 기존 Canvas realtime client와 cursor overlay의 전달 패턴만 참고하고, SQLtoERD 전용 hook·room payload를 `features/sql-erd/`에 둔다.
- remote selection은 table, FK relation, annotation ID만 표시한다. 상대의 선택이 local 선택·drag·one-shot placement 도구 상태를 바꾸면 안 된다.
- layout/annotation 변경은 `applyLayoutPatch(currentLayout)`의 함수형 최신 상태 병합 경로 하나로 들어간다. table sync와 annotation sync가 오래된 전체 `layoutJson`을 각각 저장하면 안 된다.
- source lock holder가 아닌 client는 remote `source_snapshot` 수신 시 source/model/layout을 canonical 값으로 교체하고 selection·camera는 가능한 한 유지한다. 구조상 존재하지 않는 선택만 해제한다.

## 단계별 rollout과 이슈 분리

| 순서 | 후속 Issue | 구현 범위 | 필수 리뷰 |
| --- | --- | --- | --- |
| 1 | SQLtoERD realtime room·presence | session access, room join/leave, cursor·selection presence | 세인, 진호, 동현 |
| 2 | SQLtoERD durable operation 계약 | DB operation log, API 문서, submit/catch-up endpoint, Redis publish | 세인, 은재, 진호 |
| 3 | SQLtoERD layout·annotation 동기화 | frontend optimistic patch, remote apply, reconnect recovery | 세인, 진호 |
| 4 | SQLtoERD source lease lock | DB lock, source read-only UX, snapshot broadcast | 세인, 은재, 진호 |

1단계는 presence만 제공하므로 사용자 데이터의 동시 저장을 해결하지 않는다. 2~4단계를 모두 완료하기 전에는 기존 `revision` 충돌 UX를 유지한다.

## 소유권과 검토 경계

- SQLtoERD: 세인 — session payload, layout patch, source UX, API 문서
- Infra/Realtime: 진호 — socket module, Redis channel, deployment/observability
- Canvas: 동현 — shared realtime client/presence overlay 재사용 여부
- DB Schema: 은재 — operation/lock migration, index, RLS, transaction 검토

후속 구현에서 `apps/frontend/src/shared/`, `apps/app-server/src/common/`, `apps/app-server/src/database/`, app bootstrap 또는 realtime-server 공통 socket 흐름을 수정해야 하면, 각 공통영역 규칙에 따라 사이렌 변경 여부와 추가 리뷰를 먼저 확정한다.

## 완료 판단

이 설계 Issue는 위 계약, source 동시 편집 정책, 후속 4개 작업 분리가 문서화되고 PR review를 통과하면 완료한다. 실제 동시 편집 기능의 출시 완료를 뜻하지 않는다.
