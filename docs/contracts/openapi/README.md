# PILO OpenAPI Contracts

이 폴더는 도메인 간 HTTP API 경계를 기계가 읽을 수 있는 형태로 고정한다.

## Source of Truth

- Owner-local OpenAPI fragments live in `docs/contracts/openapi/domains/<domain>.paths.yaml`.
- Feature PRs edit only domain OpenAPI fragments in `docs/contracts/openapi/domains/<domain>.paths.yaml`.
- Contract integration PRs serialize bundle updates to `pilo-public-api.yaml` after the owner fragments are reviewed.

- Public DTO 필드와 enum은 `docs/contracts/schemas/pilo-public-contracts.schema.json`을 따른다.
- HTTP path, method, owner, consumer-facing request/response 형태는 `pilo-public-api.yaml`을 따른다.
- DB table과 migration owner는 `docs/db/pilo_erd_schema.sql`과 `docs/db/db-schema-by-owner.md`를 따른다.

## 변경 규칙

1. 새 cross-domain endpoint가 필요하면 domain contract 문서를 먼저 수정한다.
2. Feature PRs edit only domain OpenAPI fragments. Do not edit `pilo-public-api.yaml` directly in a feature PR.
3. Contract integration PRs serialize bundle updates to `pilo-public-api.yaml`, JSON Schema, TS mirrors, Python mirrors, controller stubs, and guardrail tests.
4. 구현 PR은 이 명세에 있는 path 안에서 controller/service/repository 함수만 채운다.
5. consumer가 아직 준비되지 않았으면 fixture나 mock adapter를 사용하고 실제 연결은 후속 Issue로 분리한다.

## 충돌 방지 규칙

- 각 path의 첫 segment owner가 controller를 소유한다.
- Dashboard, Canvas, Agent처럼 여러 도메인을 읽는 화면은 원본 DB를 직접 읽지 않고 summary/read model endpoint를 호출한다.
- `AppModule` bootstrap에는 모든 domain module이 미리 등록되어 있으므로 기능 PR에서 새 module import만 추가하지 않는다.
