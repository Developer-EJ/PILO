# Contract Fixtures

이 폴더는 provider domain이 아직 구현되지 않았을 때 consumer가 독립적으로 UI/API를 개발하기 위한 fixture를 보관한다.

## 사용 규칙

- fixture 필드명은 `docs/contracts/schemas/pilo-public-contracts.schema.json`의 public DTO와 맞춘다.
- fixture는 실제 DB schema를 대체하지 않는다.
- fixture를 사용하는 PR은 실제 연동 제거 Issue를 연결한다.
- fixture에 없는 필드가 필요하면 먼저 contract를 수정한다.
- secret, token, 실제 사용자 개인정보는 fixture에 넣지 않는다.

## 파일

| 파일 | 용도 |
|---|---|
| `workspace-dashboard.fixture.json` | Dashboard, Canvas, Review, Meeting, Agent action 화면의 공통 mock |
| `review-room.fixture.json` | Review room 생성/조회 API와 PR fixture 연동 검증용 mock |
| `review-analysis.fixture.json` | Review graph, node, risk summary 화면과 contract 검증용 mock |
| `planning-detail.fixture.json` | Planning 상세 결과 화면과 승인 후 owner API 결과 표시용 mock |
| `agent-job.fixture.json` | App Server가 AI Worker로 보내는 SQS job message mock |
| `agent-result.fixture.json` | AI Worker가 App Server로 돌려주는 SQS result message mock |
| `agent-run-detail.fixture.json` | Agent run detail/status inspection response mock |
| `github-repositories.fixture.json` | Owner-side GitHub App repository sync fixture for `GithubRepositorySummary` rollout validation; not a consumer mock |
