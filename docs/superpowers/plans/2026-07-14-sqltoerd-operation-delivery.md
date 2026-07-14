# SQLtoERD Durable Operation Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 snapshot autosave를 유지하면서 SQLtoERD operation log·outbox·catch-up 기반과 write protocol hard gate를 추가한다.

**Architecture:** `sql_erd_sessions.write_protocol`은 모든 기존 session을 `snapshot`으로 유지한다. `operations_v1` session에서만 App Server가 layout patch를 session row lock 아래 최신 layout에 병합하고, operation/outbox를 같은 transaction으로 기록한다. publisher가 Redis channel에 전달하면 realtime-server가 room에 broadcast한다.

**Tech Stack:** PostgreSQL migration/RLS, NestJS SQLtoERD module, Redis publish/subscribe, Socket.IO, Node assertion scripts.

## Global Constraints

- `snapshot` session의 기존 full PATCH autosave는 변경하지 않는다.
- 실제 `operations_v1` 전환 UI, metadata writer, source snapshot/lease는 후속 Issue 범위다.
- `layout_patch`만 operation으로 허용한다. patch는 add/update/delete를 명확히 구분한다.
- DB schema와 realtime 공통 변경이므로 은재·진호 검토가 필요하다.

---

### Task 1: Write protocol과 durable storage migration

**Files:**
- Create: `db/migrations/061_create_sql_erd_operation_delivery.sql`
- Modify: `db/README.md`
- Test: `apps/app-server/scripts/sql-erd/operation-delivery.test.mjs`

- [ ] migration 정적 회귀 test를 먼저 추가한다. `write_protocol`, `latest_op_seq`, operation/outbox unique key, RLS, `claimed_at` reclaim index를 검증한다.
- [ ] test가 migration 부재로 실패함을 확인한다.
- [ ] session에 `write_protocol TEXT NOT NULL DEFAULT 'snapshot'`, `latest_op_seq BIGINT NOT NULL DEFAULT 0`을 추가하고 operation/outbox table·index·RLS·comment를 생성한다.
- [ ] App Server test를 실행해 통과를 확인한다.
- [ ] `git commit -m "feat(sqltoerd,db): operation delivery 저장소를 추가한다 (#1031)"`.

### Task 2: App Server layout operation API와 write protocol gate

**Files:**
- Modify: `apps/app-server/src/modules/sql-erd/sql-erd.controller.ts`
- Modify: `apps/app-server/src/modules/sql-erd/sql-erd.service.ts`
- Modify: `apps/app-server/src/modules/sql-erd/sql-erd.types.ts`
- Modify: `apps/app-server/src/modules/sql-erd/sql-erd.validation.ts`
- Create: `apps/app-server/src/modules/sql-erd/sql-erd-operation.mapper.ts`
- Test: `apps/app-server/scripts/sql-erd/operation-delivery.test.mjs`

- [ ] duplicate `clientOperationId`, stale rebase, future revision 409, `operations_v1` legacy PATCH 409을 검증하는 실패 test를 추가한다.
- [ ] `POST /sql-erd-sessions/:sessionId/operations`, `GET .../operations?afterSeq&limit`를 추가한다.
- [ ] `layout_patch`를 최신 `layout_json`에 함수형 명령으로 병합하고, row lock 아래 revision·op sequence·operation·outbox를 같은 transaction에서 기록한다.
- [ ] `snapshot` PATCH는 유지하고 `operations_v1`의 durable-state PATCH만 `SQL_ERD_WRITE_PROTOCOL_MISMATCH`로 거절한다.
- [ ] App Server format/test/lint/build를 실행한다.
- [ ] `git commit -m "feat(sqltoerd,api): layout operation API를 추가한다 (#1031)"`.

### Task 3: Outbox publisher와 realtime operation relay

**Files:**
- Create: `apps/app-server/src/modules/sql-erd/sql-erd-operation-publisher.service.ts`
- Modify: `apps/app-server/src/modules/sql-erd/sql-erd.module.ts`
- Modify: `apps/realtime-server/src/sql-erd/sql-erd-socket-events.ts`
- Modify: `apps/realtime-server/src/sql-erd/sql-erd-types.ts`
- Modify: `apps/realtime-server/src/socket/socket-server.ts`
- Test: `apps/app-server/scripts/sql-erd/operation-delivery.test.mjs`
- Test: `apps/realtime-server/scripts/sql-erd-operation-delivery.test.mjs`

- [ ] pending claim, 60초 publishing reclaim, claim-token 보호, Redis 중복 payload 검증의 실패 test를 추가한다.
- [ ] outbox publisher가 `FOR UPDATE SKIP LOCKED`로 claim, publish, delivered/retry 상태를 갱신하도록 구현한다.
- [ ] realtime-server가 `sql-erd:operations` channel의 유효한 저장 확정 operation만 `sql-erd:operation`으로 room broadcast하도록 구현한다.
- [ ] App Server·Realtime Server format/test/lint/build를 실행한다.
- [ ] `git commit -m "feat(sqltoerd,realtime): operation outbox relay를 추가한다 (#1031)"`.

### Task 4: API 문서와 최종 검증

**Files:**
- Modify: `docs/api/sqltoerd-api.md`
- Modify: `docs/superpowers/plans/2026-07-14-sqltoerd-operation-delivery.md`

- [ ] request/response, operation payload, rebase/future revision, catch-up, outbox at-least-once, write protocol mismatch를 문서화한다.
- [ ] `git diff --check origin/dev...HEAD`, App Server·Realtime Server format/test/lint/build를 실행한다.
- [ ] Issue #1031의 checklist와 PR 본문에 검증 결과·은재/진호 review point를 반영한다.
- [ ] `git commit -m "docs(sqltoerd): operation delivery 계약을 문서화한다 (#1031)"`.
