# Agent Runtime Resilience Implementation Plan

**Goal:** 운영 전환 뒤 드러난 Canvas AI DB 복구 오류와 Meeting Agent 완료 저장 오류를 DB schema 변경 없이 수정한다.

**Architecture:** Canvas planner는 유효한 분류의 빈 표시 문구만 결정적으로 보정한다. Canvas repository는 모든 쿼리를 연결 상태 확인 및 `OperationalError` 변환 경계로 통과시키되 실패 SQL은 재실행하지 않는다. App Server는 완료 상태 문구와 전체 최종 답변을 별도 SQL 파라미터로 저장한다.

**Tech Stack:** Python 3, pytest, psycopg 3, TypeScript, NestJS, Node assertion tests

---

## Task 1: Canvas planner 빈 message 보정

**Files:**

- Modify: `apps/ai-worker/tests/canvas_agent/test_planner.py`
- Modify: `apps/ai-worker/app/canvas_agent/planning/planner.py`

1. 유효한 `find_shapes` 분류에서 빈 `message`가 기본 문구로 바뀌는 테스트를 추가한다.
2. 해당 테스트만 실행해 기존 코드에서 실패하는지 확인한다.
3. intent별 기본 문구 선택 함수를 추가하고 빈 문자열에만 적용한다.
4. 해당 테스트와 기존 planner 파일 테스트를 실행한다.

## Task 2: Canvas 실패 SQL 타입 및 연결 복구

**Files:**

- Modify: `apps/ai-worker/tests/canvas_agent/test_repository.py`
- Modify: `apps/ai-worker/app/canvas_agent/repository.py`

1. `mark_failed()` JSONB message가 `%s::text`를 사용하는 테스트를 추가한다.
2. 쿼리 실행 중 `OperationalError`가 발생하면 연결을 교체하고 현재 쿼리를 재실행하지 않은 채 `InfrastructureError`를 올리는 테스트를 추가한다.
3. 두 테스트만 실행해 기존 코드에서 실패하는지 확인한다.
4. 연결 factory, 연결 상태 확인, 공통 execute 경계를 구현한다.
5. repository의 직접 execute 호출을 공통 경계로 이동하고 transaction 경로에도 같은 오류 변환을 적용한다.
6. 실패 저장 JSONB message 파라미터에 `::text`를 명시한다.
7. repository 테스트 파일만 실행한다.

## Task 3: Meeting Agent 완료 상태와 답변 분리

**Files:**

- Modify: `apps/app-server/scripts/agent/logging.test.mjs`
- Modify: `apps/app-server/src/modules/agent/agent-logging.service.ts`

1. UTF-8 1,000바이트를 넘는 한글 완료 답변을 사용해 `message`는 짧은 완료 상태이고 `finalAnswer`와 대화 메시지는 원문인 테스트를 추가한다.
2. App Server를 빌드하고 logging 테스트만 실행해 기존 코드에서 실패하는지 확인한다.
3. 완료 SQL에서 run message와 final answer 파라미터를 분리한다.
4. 테스트 fake DB가 분리된 파라미터 계약을 반영하도록 수정한다.
5. App Server 빌드와 logging 테스트만 다시 실행한다.

## Task 4: 최소 통합 검증 및 자체 검토

1. 변경된 Python 테스트 파일 두 개만 실행한다.
2. App Server build와 agent logging 테스트만 실행한다.
3. `git diff --check`, 변경 파일 diff, 작업 트리 상태를 확인한다.
4. API 계약, DB schema, 인프라 파일이 변경되지 않았는지 확인한다.
5. 구현 변경을 목적별 커밋으로 기록한다.

## 검증 명령

```powershell
python -m pytest apps/ai-worker/tests/canvas_agent/test_planner.py -q
python -m pytest apps/ai-worker/tests/canvas_agent/test_repository.py -q
npm.cmd run build
node scripts/agent/logging.test.mjs
git diff --check
```

App Server 명령은 `apps/app-server`에서 실행한다. 전체 pytest, 전체 App Server 테스트, E2E 테스트는 사용자 요청에 따라 수행하지 않는다.
