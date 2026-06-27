# Shared Implementation Rules

이 문서는 모든 AGENT가 같은 방식으로 구현하도록 맞추는 공통 규칙이다.

## Branch and PR

- branch 이름은 `feature/<owner>/<domain>-<short-task>` 형식을 권장한다.
- PR 제목은 `[담당자][domain] 작업 요약` 형식으로 쓴다.
- PR 본문에는 contract 영향, DB 영향, mock 사용 여부, 검증 결과를 적는다.
- public contract 변경은 기능 구현 PR과 분리한다.

## API Ownership

- write API는 원본 데이터를 소유한 owner만 만든다.
- consumer는 다른 owner의 write API를 직접 우회하지 않는다.
- 읽기 전용 화면은 read model 또는 summary API를 사용한다.
- cross-domain bulk 조회가 필요하면 consumer가 직접 join하지 말고 provider에게 summary endpoint를 요청한다.

## Mock and Fixture

- 구현되지 않은 provider는 `docs/contracts/fixtures` fixture로 대체한다.
- fixture는 public contract schema의 필드명을 따른다.
- mock adapter는 실제 API client와 같은 함수 시그니처를 가져야 한다.
- mock 제거는 별도 Issue로 남기고 PR 본문에 연결한다.

## DB and Migration

- 최종 논리 스키마는 `docs/db/pilo_erd_schema.sql`이다.
- 실제 migration 이름은 `YYYYMMDDHHMM_owner-slug_domain_action` 형식을 따른다.
- 다른 owner의 table에는 migration을 추가하지 않는다.
- 다형 참조(`entity_type`, `entity_id`)는 DB FK 대신 service 검증과 contract test로 보호한다.

## Frontend

- 화면은 `docs/design.md`의 색상, spacing, card radius, typography 기준을 따른다.
- 한 domain 화면이 다른 domain 데이터를 기다릴 때는 skeleton, empty state, fixture-backed mock을 사용한다.
- dashboard, canvas처럼 여러 domain을 모으는 화면은 원본 상태 변경 버튼을 만들지 않는다. 필요한 경우 provider 화면으로 이동시킨다.

## Backend

- NestJS module은 controller, service, repository, dto, public adapter를 분리한다.
- public adapter에는 다른 domain이 소비할 read model 변환만 둔다.
- domain 내부 entity와 public DTO를 같은 타입으로 쓰지 않는다.
- 외부 provider key, OAuth token, GitHub token은 env 또는 Secrets Manager 기준으로만 다룬다.

## AI Worker and Agent

- Agent는 직접 DB를 쓰지 않고 action을 만든다.
- action 실행은 owner API 또는 app-server command handler가 담당한다.
- action payload는 `pilo-public-contracts.schema.json`의 `AgentAction`을 따른다.
- workflow trace는 재현 가능한 input, output, error를 남긴다.

## Stop Conditions

아래 상황이면 구현을 멈추고 contract change PR 또는 질문을 먼저 만든다.

- 필요한 필드가 public contract에 없다.
- 같은 데이터를 두 owner가 write하려고 한다.
- 다른 domain table에 FK 또는 migration을 추가해야 한다.
- mock으로는 UX 검증이 불가능한 실시간 동작이 필요하다.
- auth, permission, billing, secret 처리 방식이 문서와 다르다.
