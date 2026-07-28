# SQLtoERD Source Lock Lifecycle Design

## Context

`operations_v1` session의 SQL source는 한 사용자만 편집할 수 있도록 30초 lease 기반 lock을 사용한다. 현재 Frontend는 Source 패널이 열려 있는 동안 lock을 획득하고 10초마다 갱신한다. 그래서 FK source 위치를 조회하거나 캔버스로 돌아간 뒤에도 패널이 열려 있으면 lock이 계속 유지되고, 다른 사용자는 실제 편집자가 없는 상황에서도 SQL을 수정할 수 없다.

Source snapshot 저장 중 발생한 모든 409도 layout autosave의 전역 `conflict`로 분류된다. Source lease 충돌 하나가 canvas operation 저장까지 멈추므로 서로 독립이어야 할 쓰기 경로가 UI 상태에서 결합되어 있다.

## Goals

- Source 패널의 열림 여부가 아니라 실제 source 편집 의도와 미저장 작업을 기준으로 lock을 유지한다.
- 단순 Source 조회와 FK source navigation은 lock을 획득하지 않는다.
- editor focus가 캔버스로 이동하고 미저장 작업이 없으면 lock을 해제한다.
- dirty source, parse/apply, pending source publish가 있으면 저장 완료 전까지 lock을 유지한다.
- 빠른 focus 전환에서도 이전 lease release가 끝난 뒤 다음 acquire가 실행되게 한다.
- `source-snapshots`의 409는 source lock 재획득/재시도 상태로 처리하고 layout autosave를 중단하지 않는다.

## Non-goals

- Remote source snapshot과 이미 대기 중인 layout operation의 rebase 정책은 변경하지 않는다.
- App Server endpoint, request/response, status code, DB schema는 변경하지 않는다.
- Source lock의 30초 TTL과 10초 renew 간격은 변경하지 않는다.

## State model

Frontend는 다음 조건 중 하나가 참일 때만 source lock을 요청한다.

- SQL editor에 사용자의 편집 의도가 남아 있다.
- source draft가 마지막 성공 snapshot과 다르다.
- source snapshot publish가 대기 또는 실행 중이다.
- SQL 재생성 preview가 열려 있거나 Apply parse가 실행 중이다.

단순히 Source 패널이 열려 있는 상태는 lock 유지 조건이 아니다. SQL editor는 읽기 전용 상태에서도 pointer/focus intent를 전달하고, lock 획득 후 편집 가능 상태로 바뀐다. Editor가 focus를 잃더라도 dirty/pending 작업이 있으면 lock을 유지하고, 저장 완료 뒤 모든 유지 조건이 사라지면 release한다.

## Lease transition ordering

Hook 수준의 lifecycle queue가 React effect cleanup의 `stop()`과 다음 effect의 `start()`를 직렬화한다. Controller 내부 queue는 acquire, renew, recover, release가 동시에 실행되지 않게 한다. 이전 controller의 state callback은 cleanup 뒤 무시하여 새 controller 상태를 덮어쓰지 않는다.

Source publish 409가 발생하면 현재 controller를 `recover()`하여 보유 lease를 best-effort release한 뒤 active intent가 남아 있을 때 새 lease를 획득한다. Pending snapshot은 유지되어 새 lease의 `sourceBaseRevision`으로 다시 publish한다.

## Error boundary

`SqlErdApiError.path`가 `/source-snapshots`로 끝나고 status가 409인 경우는 `source_conflict`로 분류한다. 이 오류는 source autosave를 retry 상태로 전환하지만 `layoutAutosaveBlockReason`을 설정하지 않는다.

`SQL_ERD_WRITE_PROTOCOL_MISMATCH`, membership/auth 오류, session not found, invalid payload 등 기존의 영구 오류는 기존 전역 block 계약을 유지한다. Network/408/429/5xx는 기존 지수 backoff 재시도를 유지한다.

## Validation

- Pure intent test: clean/open-only는 false, editor/dirty/pending/preview/applying은 true.
- Controller test: 빠른 stop/start에서 release 완료 뒤 acquire 순서를 보장한다.
- Controller test: recover가 lease를 release하고 active 상태에서 재획득한다.
- Error classifier test: source snapshot 409는 source conflict, layout/session 409는 global conflict다.
- Existing SQLtoERD realtime regression script와 Frontend typecheck를 실행한다.
