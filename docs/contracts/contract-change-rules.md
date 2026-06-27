# Contract 변경 규칙

## 목적

이 문서는 `docs/contracts/*` 변경 시 어떤 순서로 리뷰하고 merge할지 정의한다.

Contract는 도메인 간 약속이다. 따라서 MD 설명만으로 끝내지 않고, 영향 범위와 소비자를 명확히 기록해야 한다.

## Contract 종류

| 종류 | 설명 | 예시 |
|---|---|---|
| Internal contract | 한 도메인 내부에서만 사용하는 계약 | Task 내부 filter, Review 내부 분석 옵션 |
| Public contract | 다른 도메인이 읽거나 호출하는 계약 | TaskSummary, MeetingReport, AgentAction |
| Machine-readable contract | CI가 검증할 수 있는 계약 | OpenAPI, JSON Schema, generated types |

## 기본 원칙

- Public contract 변경은 구현 PR보다 먼저 별도 PR로 올린다.
- Contract 변경 PR은 관련 도메인 owner가 리뷰한다.
- Contract 변경 후 기존 작업자는 `dev`를 최신화한 뒤 구현을 계속한다.
- Breaking change는 바로 제거하지 않고 deprecated 기간을 둔다.
- MD는 설명용이고, 가능한 경우 schema 또는 generated type으로 검증 가능하게 만든다.

## Self-Approve 가능 조건

아래 조건을 모두 만족하면 contract owner가 단독으로 진행할 수 있다.

- 변경 대상이 본인 소유 도메인이다.
- 외부 consumer가 없다.
- public API, event, read model, Agent action에 영향이 없다.
- PR 본문에 `Internal-only change` 또는 `No external consumer`를 명시했다.
- CI가 통과했다.

## Self-Approve 금지 조건

아래 항목은 다른 도메인이 소비할 가능성이 높으므로 단독으로 merge하지 않는다.

- `TaskSummary`
- `ProgressSummary`
- `MeetingReport`
- `AgentAction`
- `PRAnalysisSummary`
- Dashboard, Canvas, Agent, Report에서 읽는 모든 read model
- API request/response 필드 제거 또는 의미 변경
- event payload 필드 제거 또는 의미 변경

## 변경 PR 본문 템플릿

```md
## Contract Change
- 변경한 contract:
- 변경 내용:

## Impact
- Owner:
- Consumers:
- Internal-only change: Yes/No

## Breaking Change
- Yes/No
- Deprecated field:
- Migration plan:

## Validation
- 문서 업데이트:
- Schema 업데이트:
- 관련 테스트:
```

## 권장 흐름

1. Contract 변경 필요성을 확인한다.
2. `docs/contracts/*`를 먼저 수정한다.
3. 관련 owner 리뷰를 받는다.
4. `dev`에 contract PR을 먼저 merge한다.
5. 구현 브랜치는 `dev`를 최신화한다.
6. 구현 PR에서 contract test와 CI를 통과시킨다.

## 향후 자동화 방향

- `docs/contracts/openapi/*.yaml`로 API 계약을 관리한다.
- `docs/contracts/events/*.schema.json`으로 event payload를 검증한다.
- `docs/contracts/agent-actions/*.schema.json`으로 Agent action을 검증한다.
- CI에서 breaking change와 schema validation을 실행한다.

