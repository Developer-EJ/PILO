# Agent 런타임 복구 설계

## 배경

운영 전환 뒤 두 가지 잠재 오류가 실제 장애로 드러났다.

1. Canvas AI가 유효한 `intent`와 `arguments`를 반환해도 `message`가 비어
   있으면 계획 단계가 실패한다. 이어지는 실패 저장 쿼리도 PostgreSQL이
   JSONB 함수 파라미터 타입을 결정하지 못해 실패할 수 있다.
2. RDS 연결이 끊긴 뒤 Canvas AI Worker가 시작 시 만든 연결을 계속
   재사용하여 이후 작업도 실패한다.
3. Meeting Agent의 최종 답변을 `agent_runs.message`와 `final_answer`에
   동일하게 저장한다. 한글 답변이 `message`의 1,000바이트 제한을 넘으면
   완료 트랜잭션 전체가 롤백된다.

## 목표

- 유효한 Canvas AI 계획은 빈 설명 문구 때문에 중단되지 않는다.
- Canvas AI 실패 상태 저장이 PostgreSQL 타입 추론에 의존하지 않는다.
- RDS 연결 손실 뒤 다음 SQS 전달부터 새 연결로 처리할 수 있다.
- Meeting Agent의 전체 최종 답변 품질을 유지하면서 완료 상태를 안정적으로
  저장한다.

## 비목표

- DB schema 또는 제약조건 변경
- RDS, ECS, SQS 설정 변경
- 모든 AI Worker 저장소를 포괄하는 공통 연결 계층 도입
- 실패한 SQL의 즉시 자동 재실행
- Realtime 또는 Redis 장애 수정

## 설계

### 1. Canvas AI 빈 message 보정

`intent`와 `arguments` 검증이 성공했지만 `message`가 비어 있으면,
해당 intent에 맞는 짧은 기본 문구를 사용한다. 잘못된 intent나 arguments는
기존처럼 분류 실패로 처리한다.

이 방식은 모델이 선택한 유효한 작업을 보존하면서 사용자에게 표시할 진행
문구만 결정적으로 보완한다.

### 2. Canvas AI 실패 저장 타입 명시

`mark_failed()`와 같은 실패 저장 SQL에서
`jsonb_build_object('message', %s::text, ...)`처럼 파라미터 타입을
명시한다. 저장 내용과 API 계약은 바꾸지 않는다.

### 3. RDS 연결 재생성

Canvas Agent repository가 연결 생성 정보와 현재 연결을 관리한다.
쿼리 실행 전에 연결이 닫혔거나 손상됐으면 새 연결을 만든다.

실행 중 `psycopg.OperationalError`가 발생하면 현재 연결을 폐기하고 새 연결을
준비한 뒤 `InfrastructureError`를 올린다. 실패한 SQL은 같은 호출 안에서
재실행하지 않는다. 서버가 SQL을 반영한 직후 연결이 끊긴 경우의 중복 쓰기를
막기 위해서다. 상위 SQS 처리기는 메시지를 삭제하지 않고 다음 전달에서 새
연결을 사용한다.

트랜잭션 경로도 같은 원칙을 적용하며 부분 트랜잭션을 즉시 재생하지 않는다.

### 4. Meeting Agent 완료 저장 분리

`agent_runs.message`에는 `"요청을 완료했습니다."`처럼 짧은 상태 문구를
저장한다. 생성된 전체 답변은 변경하거나 자르지 않고 `final_answer`와 기존
대화 메시지에 저장한다.

API 계약에서 `message`는 현재 상태를 설명하는 짧은 문구이고
`finalAnswer`는 최종 답변이다. 프런트도 완료 상태에서는 `finalAnswer`를
우선 표시하므로 사용자 답변 품질은 변하지 않는다.

## 오류 처리

- 빈 Canvas message만 보정하며 구조적으로 잘못된 분류 결과는 숨기지 않는다.
- DB 연결 손실은 retryable infrastructure failure로 취급한다.
- 연결 손실 시 현재 SQL을 재실행하지 않아 at-least-once 전달 환경의 중복
  부작용을 최소화한다.
- Meeting Agent 최종 답변은 기존 제한과 정규화 규칙을 그대로 적용한다.

## 최소 검증

전체 테스트 스위트는 실행하지 않는다. 다음 회귀 지점만 검증한다.

1. Canvas planner가 유효한 intent와 arguments, 빈 message를 기본 문구로
   보정한다.
2. Canvas 실패 저장 SQL이 JSONB message 파라미터를 text로 명시한다.
3. 끊어진 Canvas repository 연결이 교체되고 현재 작업은 retryable failure로
   반환된다.
4. 1,000바이트를 넘는 한글 Meeting Agent 답변이 전체 `finalAnswer`를
   유지하면서 짧은 run message로 완료 저장된다.

변경 파일에 필요한 최소 정적 검사 또는 빌드 검사만 추가로 실행한다.

## 배포 영향

DB migration과 인프라 apply는 필요 없다. App Server와 AI Worker 이미지만
새 코드로 배포하면 된다. 배포 뒤 기존 실패 run을 자동 복구하지는 않으므로
필요한 요청은 다시 실행한다.
