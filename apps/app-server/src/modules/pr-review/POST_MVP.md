# PR Review Post-MVP 계획

이 문서는 PR Review MVP 이후 고도화 방향을 정리하는 결정 기록이다.
API 계약 문서는 아니며, 구현 중 API나 DB schema가 바뀌면
`docs/api/pr-review-api.md`와 관련 도메인 API 문서를 함께 수정한다.
Conflict 구현 진행 체크리스트는 `POST_MVP_CONFLICT_IMPLEMENTATION_CHECKLIST.md`를 따른다.
Merge action 구현 진행 체크리스트는 `POST_MVP_MERGE_IMPLEMENTATION_CHECKLIST.md`를 따른다.
비동기 AI 분석 구현 진행 체크리스트는 `POST_MVP_ASYNC_ANALYSIS_IMPLEMENTATION_CHECKLIST.md`를 따른다.

## Post-MVP Pillars

PR Review Post-MVP는 아래 4개 축으로 진행한다.

```text
1. AI Conflict Resolution Assistant
2. Async AI Analysis Pipeline
3. Semantic Review Graph
4. Collaborative Review Canvas
```

우선순위는 발표 임팩트와 구현 안정성을 기준으로 정한다.

```text
Conflict 해결 happy path
  -> 큰 PR도 안정적으로 처리하는 비동기 분석
  -> 리뷰 순서와 관계를 개선하는 graph 고도화
  -> 팀원이 함께 보는 협업 Canvas
```

## 1. AI Conflict Resolution Assistant

최우선 Post-MVP 목표는 conflict PR을 PR Review 안에서 이해하고 해결까지 이어지게
돕는 것이다.

완전 자동 conflict 해결 시스템이 아니라, 사용자가 확인하고 적용하는 happy path를
목표로 한다.

```text
Conflict PR 선택
  -> PR Review room 진입
  -> conflict 상태를 header/graph에 표시
  -> conflict file node 또는 conflict panel 진입
  -> 충돌 파일/구간 확인
  -> AI가 해결안 생성
  -> 사용자가 해결안을 확인/수정
  -> Apply resolution
  -> PR head와 base를 parent로 갖는 merge commit
  -> conflict 재확인
  -> Merge
```

역할 분담:

- AI: 충돌 원인 설명, 해결 방향 제안, resolved content 또는 patch 초안 생성
- 사용자: 해결안 확인, 필요 시 수정, 적용 승인, merge 최종 승인
- 서버: conflict 추출, AI 요청, 실제 Git merge 기반 conflict 해결 commit, PR 상태 재확인,
  merge API 호출

### Phase 1 PR 분할

1단계는 하나의 큰 PR로 구현하지 않는다. 각 PR은 하나의 목적과 하나의 review surface만
가진다.

1. `1-A. Scope and contract`
   - 첫 지원 범위와 API 경계를 확정한다.
   - conflict 분석 결과를 저장할지, 요청 시 계산할지 결정한다.
   - 분석 trigger를 sync로 둘지 async로 둘지 결정한다.
   - runtime 동작 변경은 포함하지 않는다.

2. `1-B. Read-only conflict analysis`
   - conflicted PR에서 파일/구간 단위 conflict 정보를 추출한다.
   - `content / line conflict`를 첫 지원 범위로 둔다.
   - PR head branch에는 쓰지 않는다.
   - merge API를 호출하지 않는다.

3. `1-C. Review room conflict UX`
   - Review room header/file node에 conflict 상태를 표시한다.
   - conflict file은 Conflict Resolution mode로 진입한다.
   - conflict가 해결되기 전에는 일반 file decision을 숨기거나 비활성화한다.

4. `1-D. AI suggestion draft`
   - 추출된 conflict hunk를 바탕으로 충돌 원인과 해결 초안을 생성한다.
   - AI output은 사용자가 확인하기 전까지 suggestion으로만 취급한다.

5. `1-E. Apply resolution write path`
   - 사용자가 확인한 resolved content만 PR head branch의 merge commit에 적용한다.
   - head SHA, blob SHA, conflict marker 검증을 통과해야 한다.
   - 초기에는 지원 가능한 content conflict file이 정확히 1개인 PR만 적용하고, 후속
     multi-file slice에서는 모든 conflict 파일을 하나의 merge commit으로 원자적으로 적용한다.
   - 임시 Git working tree에서 base를 실제 merge해 충돌 없는 base 변경도 함께 보존한다.
   - 최종 merge는 별도 명시적 사용자 action으로 둔다.

### Phase 1-A 확정 범위

초기 구현은 순차적으로 진행한다. 먼저 읽기 전용 conflict 분석 계약을 확정하고,
그 다음 Review room 표시, AI suggestion, apply write path 순서로 확장한다.

- Conflict analysis API는 review session 기준 endpoint로 둔다.
- 초기 read-only slice는 conflict 분석 결과를 DB에 저장하지 않고 요청 시 계산한다.
- 초기 read-only slice는 async job 없이 sync 요청으로 처리한다.
- GitHub Integration 공개 API는 늘리지 않고 PR Review 내부 dependency adapter를 확장한다.
- 초기 read-only slice는 `content / line conflict`만 지원한다.
- PR head branch commit, merge API 호출, AI suggestion 생성은 후속 slice에서 다룬다.

### 지원할 Conflict 유형

초기 happy path에서는 텍스트 기반 conflict 4종을 지원한다.

1. `content / line conflict`
   - 양쪽 branch가 같은 파일의 같은 줄 근처를 다르게 수정한 경우
   - AI는 두 변경을 합친 resolved content를 제안한다.

2. `modify/delete conflict`
   - 한쪽 branch는 파일을 삭제하고, 다른 쪽 branch는 같은 파일을 수정한 경우
   - AI는 삭제 유지 또는 파일 복원 후 수정 반영 중 더 적절한 방향을 제안한다.

3. `rename/modify conflict`
   - 한쪽 branch는 파일을 rename/move하고, 다른 쪽 branch는 기존 파일을 수정한 경우
   - AI는 rename된 새 경로에 수정사항을 반영하는 방향을 제안한다.

4. `add/add conflict`
   - 양쪽 branch가 같은 경로에 새 파일을 각각 추가한 경우
   - AI는 두 내용을 병합하거나 파일명을 분리하는 방향을 제안한다.

초기 제외 또는 수동 안내 대상:

- binary conflict
- rename/rename conflict
- submodule conflict
- permission/mode conflict
- semantic conflict

### Conflict 데이터 수집

GitHub API는 PR 단위 merge 가능 여부는 제공하지만, 안정적인 파일 단위 conflict hunk를
바로 제공하지 않는다. 따라서 backend 또는 worker에서 merge simulation이 필요하다.

필요 데이터:

- base branch/ref
- head branch/ref
- base sha
- head sha
- merge base
- conflict file path
- conflict type
- base/current/incoming content
- conflict hunk

예상 normalized model:

```ts
type ConflictType =
  | "content"
  | "modify_delete"
  | "rename_modify"
  | "add_add"
  | "unsupported";

type ConflictFile = {
  path: string;
  previousPath?: string | null;
  type: ConflictType;
  headContent: string;
  hunks: ConflictHunk[];
  resolutionStatus: "unresolved" | "suggested" | "applied";
  aiSummary?: string;
  aiSuggestion?: string;
  resolvedHunks?: Array<{
    hunkId: string;
    resolvedText: string;
  }>;
  resolvedContent?: string;
};
```

### File Node UX

기존 PR Review file node는 유지한다. 다만 conflict 파일이면 일반 리뷰 모드가 아니라
Conflict Resolution 모드로 진입한다.

```text
일반 file node 클릭
  -> Review File Drawer
  -> diff / AI 분석 / decision 저장

Conflict file node 클릭
  -> Conflict Resolution Drawer
  -> 충돌 구간 / AI 해결안 / Apply resolution
```

노드 표시:

- conflict badge 또는 warning icon 표시
- conflict 상태는 risk level보다 우선 표시
- PR-level conflict만 알고 파일 단위 정보가 없으면 header에만 표시하고, conflict 분석 후 파일 badge를 반영한다.

충돌 해결 전에는 일반 file decision 저장을 숨기거나 비활성화한다.

```text
충돌 해결 후 리뷰 판단 가능
```

### Apply / Merge Guard

AI가 자동으로 수정하거나 merge하지 않는다. 모든 write action에는 사용자 확인이 필요하다.

Apply resolution 시 확인할 것:

- 현재 PR head SHA가 분석 당시 head SHA와 같은지
- 대상 파일의 최신 blob SHA가 예상과 같은지
- resolved content가 비어 있거나 conflict marker를 그대로 포함하지 않는지
- GitHub write 권한이 있는지
- 요청한 conflict file 집합이 분석 결과 및 실제 Git 미해결 경로 집합과 정확히 일치하는지
- merge commit이 PR head와 base를 모두 parent로 포함하는지

Merge 시 확인할 것:

- conflict가 해소됐는지
- PR head SHA가 최신인지
- GitHub merge API가 허용하는 상태인지
- 사용자가 최종 merge를 클릭했는지

### 후순위 UX: Monaco Editor

초기 버전은 textarea 또는 단순 code editor로 해결안 편집을 구현한다.
Conflict resolver 핵심 파이프라인이 안정화된 뒤 Monaco editor를 도입한다.

Monaco 도입 목적:

- syntax highlighting
- line number
- diff preview
- multi-file conflict edit UX 개선
- 긴 파일 가독성 개선

Monaco는 conflict 해결 로직이 아니라 편집/가독성 개선 layer로 본다.

## 2. Async AI Analysis Pipeline

두 번째 우선순위는 큰 PR에서도 분석이 timeout 없이 안정적으로 끝나도록 AI 분석을
비동기화하는 것이다.

현재 MVP 분석은 App Server에서 review session 생성 흐름 안에서 수행될 수 있다.
대용량 PR에서는 timeout 또는 deterministic fallback이 발생할 수 있으므로, 분석을
비동기 job으로 분리한다.

목표:

- App Server는 `analyzing` review session과 durable job/outbox intent를 같은 transaction에
  저장한 뒤 빠르게 응답한다.
- PR Review 전용 SQS/DLQ와 별도 ECS worker service가 큰 PR 분석을 기존 Meeting/Agent AI
  작업과 격리한다. 두 worker는 같은 Docker 이미지를 재사용할 수 있다.
- AI Worker는 App Server internal handoff로 PR diff와 metadata를 조회해 분석하고, 결과 저장도
  같은 handoff로 요청한다. Worker가 PR Review DB를 직접 쓰지 않는다.
- App Server는 현재 GitHub head SHA 확인과 결과 원자 저장을 담당하고, 완전한 결과가 저장된
  뒤에만 session을 `reviewing`으로 전환한다.
- Frontend는 첫 버전에서 polling으로 `analyzing`, `reviewing`, `failed`를 갱신한다. realtime은
  후속 범위다.
- OpenAI 오류는 deterministic fallback으로 숨기지 않고 재시도 소진 후 `failed`로 처리한다.
- 큰 PR에서도 사용자가 request timeout을 만나지 않게 한다.

기본 흐름:

```text
Review session 생성
  -> analyzing session + outbox intent transaction
  -> PR Review 전용 SQS enqueue
  -> PR Review 전용 ECS worker가 internal handoff로 입력 조회
  -> AI Worker 분석
  -> App Server internal handoff로 head SHA 재검증·원자 저장
  -> reviewing 또는 failed 상태 갱신
  -> Frontend가 결과 반영
```

확정 정책:

- 생성은 `201 Created`와 `analyzing` 최소 session을 반환한다. 같은 사용자·PR의 진행 중 생성
  요청은 기존 `analyzing` session을 반환해 중복 job을 만들지 않는다.
- 분석 실패 재시도는 `failed` session을 수정하지 않고 새 session과 job을 생성한다.
- stale head SHA는 `PR_HEAD_CHANGED` failure로 끝내며 결과 graph/file을 저장하지 않는다.
- SQS payload는 job/session/workspace/head SHA와 schema version만 포함한다.
- outbox 발행은 최대 5회, Worker infrastructure failure는 SQS 3회까지 재시도한다.
- Worker는 기존 `pr_review_analysis` strict JSON schema와 `gpt-5.1-mini` 기본 모델을 유지한다.
  PR body 4,000자, file patch별 4,000자, 전체 patch 32,000자 입력 예산과 60초 timeout을 사용한다.
- 전용 queue/service와 internal handoff는 Infra/Realtime 및 PR Review 담당 확인 후 구현한다.
- Conflict suggestion 생성은 기존 동기 방식을 유지한다.

## 3. Semantic Review Graph

세 번째 우선순위는 PR Review graph가 단순 파일 목록이 아니라 리뷰어가 따라갈 수 있는
의미 있는 관계 지도가 되도록 고도화하는 것이다.

Graph 고도화는 LLM 하나에게 전체 판단을 맡기는 방식으로 진행하지 않는다.
좋은 리뷰 그래프를 만들기 위해 deterministic 분석, LLM 보강, 서버 검증을 함께 사용한다.

목표:

- 파일 역할을 더 안정적으로 추론한다.
- 파일 간 관계 후보를 만든다.
- LLM은 관계의 의미, flow 제목, review intent, edge reason을 보강한다.
- 서버는 말이 안 되는 edge, 중복 edge, 과도한 edge를 제거한다.
- Frontend는 lane/cluster layout으로 리뷰하기 좋은 흐름을 보여준다.
- conflict file은 graph에서 warning node 또는 badge로 드러낸다.

권장 구조:

```text
Backend rule engine
  -> 파일 역할 / 관계 후보 생성

LLM
  -> 변경 의도 / 관계 이유 / flow 설명 보강

Backend validator
  -> 없는 파일 edge 제거
  -> 중복 edge 제거
  -> edge 수 제한
  -> confidence 낮은 관계 제거

Frontend layout
  -> lane / cluster / edge routing 시각화
```

Backend에서 처리할 수 있는 것:

- file role inference
  - entry
  - core logic
  - api/dto
  - state/ui
  - test/docs
  - config/support
- relation inference
  - import 관계
  - test 대상 관계
  - DTO/API 변경과 UI 사용처 관계
  - 설정/문서 변경과 기능 변경의 보조 관계
- risk scoring
- flow grouping
- edge reason 후보 생성

LLM이 담당할 것:

- PR 목적 요약
- flow 제목과 설명 생성
- 관계 이유를 리뷰어가 이해할 수 있는 문장으로 변환
- 리뷰 순서 추천
- 위험도 판단 보조

LLM에게 맡기지 않을 것:

- 실제 파일 존재 여부 검증
- 모든 edge의 최종 승인
- import 관계의 사실 판단 전체
- edge 개수와 순환 제어
- 저장 schema 결정

Frontend에서 처리할 것:

- lane 배치
- node 위치 계산
- edge routing
- 겹침 방지
- edge reason 표시
- 위험도와 review status 시각화
- conflict badge 또는 warning node 표시

우선순위:

1. Backend rule engine으로 후보 관계 생성
2. LLM이 후보 관계의 설명과 flow 의미를 보강
3. Backend validator로 graph 품질 통제
4. Frontend lane/cluster layout 개선
5. 필요 시 사용자 수동 정렬과 저장된 layout 도입

## 4. Collaborative Review Canvas

네 번째 우선순위는 하나의 PR을 Workspace 구성원이 함께 리뷰하고, 새 커밋이 추가되어도
작업 맥락을 유지하는 공유 Review Canvas다. 상세 설계와 구현 순서는
`POST_MVP_COLLABORATIVE_REVIEW_CANVAS_CHECKLIST.md`를 기준으로 한다.

핵심 원칙:

```text
GitHub Pull Request 1개
  -> 공유 Review Room 1개
      -> Review Canvas 1개
      -> head SHA별 Review Revision 여러 개
```

head SHA가 바뀌어도 새 Canvas를 만들지 않는다. 기존 `pr_review_sessions`는 같은 room 안의
리뷰 버전으로 유지해 현재 분석 Worker, Flow, file, relation, Conflict와 submission 경계를
재사용한다.

Source of truth 구분:

```text
PR Review: room, revision, 분석, Flow, relation, file decision, Conflict
Canvas: node 위치·크기·그룹, annotation, 사용자 edge, viewport
Realtime: presence, cursor, shape operation 전달과 catch-up
```

## Room과 Review Board

PR마다 공유 room과 review Canvas를 하나씩 연결한다.

```text
pr_review_rooms.canvas_id -> canvas.id
canvas.board_type = 'review'
```

`pr_review_file_node`와 `pr_review_relation_edge`는 Canvas에 저장되는 전용 custom
shape다. 사용자는 file node의 위치·크기·그룹을 바꿀 수 있지만 file decision, 위험도,
Flow와 relation endpoint 같은 도메인 값은 PR Review만 변경한다. 사용자 annotation,
note와 arrow는 Canvas가 소유한다.

## 협업 Canvas 구현 단계

1. `pr_review_rooms`와 head SHA별 revision 계약을 추가한다.
2. idempotent room 생성·합류, 목록, 버전 갱신과 영구 삭제 API를 구현한다.
3. Canvas API와 Realtime이 `board_type = 'review'`를 지원하게 한다.
4. 전용 custom shape와 domain field 수정 제한을 구현한다.
5. 새 분석 결과를 기존 node geometry를 보존하며 idempotent하게 materialize한다.
6. optimistic file decision 저장과 realtime progress 갱신을 추가한다.
7. Sidebar에 `리뷰할 PR`과 `리뷰 공간` 진입점을 제공한다.

## 새 커밋 정책

- GitHub head가 현재 revision과 다르면 `새 커밋` 상태를 표시한다.
- 사용자가 최신 버전 분석을 시작해도 마지막 성공 revision을 계속 보여준다.
- 분석과 shape materialization이 모두 성공한 뒤에만 room의 현재 revision을 교체한다.
- 변경되지 않은 파일은 판단과 node 위치를 유지한다.
- 변경된 파일은 `재검토 필요`, 새 파일은 새 node로 시작한다.
- 이전 revision은 read-only 이력으로 조회한다.
- PILO의 Conflict 해결 commit도 기존 session head를 덮어쓰지 않고 같은 room의 successor
  revision으로 처리한다.

## 완료와 삭제

- PR merge 또는 close 시 room을 완료·read-only 상태로 전환한다.
- 완료 room은 Sidebar의 `리뷰 공간`에서 계속 조회한다.
- PR이 reopen되면 같은 room을 다시 활성화한다.
- 모든 Workspace 구성원은 room을 삭제할 수 있다.
- 삭제 확인 후 room, 모든 revision, 판단·제출 이력, Canvas와 annotation을 한 transaction에서
  영구 삭제한다. soft delete와 복구 기능은 제공하지 않는다.

## 제외 또는 후순위

- GitHub inline review comment 작성
- PR merge/close 완전 자동화
- ProjectV2 write API 연동
- 모든 conflict 유형 완전 지원
- CI/checks 자동 복구
- 여러 사용자가 workflow graph 구조 자체를 공동 편집하는 기능
- annotation을 GitHub review body로 자동 변환하는 기능
- 이전 revision 시점의 annotation 상태를 되감는 기능

## 관련 문서

- `docs/api/pr-review-api.md`
- `docs/api/canvas-api.md`
- `apps/app-server/src/modules/pr-review/WORKFLOW_CANVAS_STRATEGY.md`
- `apps/app-server/src/modules/pr-review/IMPLEMENTATION_CHECKLIST.md`
- `apps/app-server/src/modules/pr-review/POST_MVP_COLLABORATIVE_REVIEW_CANVAS_CHECKLIST.md`
