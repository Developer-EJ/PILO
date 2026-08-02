# Realtime Checkpoint Conflict Case Study Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이력서에서 직접 연결할 수 있는 공개용 Realtime Server checkpoint 충돌 Case Study와 비식별화된 검증 이미지를 저장소에 추가한다.

**Architecture:** 하나의 한국어 Markdown 문서가 문제, 원인, 해결, 검증, 결과를 설명하고 구현 PR과 저장소 코드를 근거로 연결한다. 검증 이미지는 별도 assets 디렉터리에 보관하며, AWS 식별자와 문서 ID가 없는 공개용 사본만 본문에 삽입한다.

**Tech Stack:** GitHub Flavored Markdown, Mermaid, PNG evidence, Git

## Global Constraints

- 공개 문서 경로는 `docs/case-studies/realtime-checkpoint-conflict.md`이다.
- 공개 이미지 경로는 `docs/assets/realtime-checkpoint-conflict/`이다.
- 개발 ECS Realtime Server 2대에서 수행한 5세션 x 300개 변경 입력 결과와 로컬 Docker 3회 반복 결과를 서로 구분한다.
- 개선 후 AWS 결과는 1,500개 변경 입력, `409 Conflict` 및 checkpoint 저장 실패 0건, 재접속 후 1,500개 유지로 제한한다.
- 로컬 Docker 결과는 4,500개 변경 입력, 정상 경로 `409 Conflict` 0건, 저장 및 신규 연결 4,500/4,500으로 제한한다.
- 영구적인 무충돌, 모든 장애에서의 무손실, 운영 트래픽 규모, 강제 종료 시 무손실을 주장하지 않는다.
- AWS 계정 ID, ARN, 사용자 정보, 문서 ID, 인증 정보 및 실제 문서 내용을 공개하지 않는다.
- 사용자 소유의 기존 미커밋 파일은 수정하거나 스테이징하지 않는다.

---

## File Structure

- Create: `docs/case-studies/realtime-checkpoint-conflict.md` — 공개용 Case Study 본문
- Create: `docs/assets/realtime-checkpoint-conflict/aws-baseline-409-redacted.png` — 문서 ID를 가린 개선 전 AWS 409 로그
- Create: `docs/assets/realtime-checkpoint-conflict/aws-after-zero-conflicts.png` — 개선 후 AWS 오류 조회 결과
- Create: `docs/assets/realtime-checkpoint-conflict/aws-after-ecs-two-tasks.png` — ECS Realtime Server task 2개 실행 화면
- Create: `docs/assets/realtime-checkpoint-conflict/local-two-node-report.png` — 로컬 Docker 3회 반복 before/after 보고서

### Task 1: 공개용 증거 이미지 준비

**Files:**
- Create: `docs/assets/realtime-checkpoint-conflict/aws-baseline-409-redacted.png`
- Create: `docs/assets/realtime-checkpoint-conflict/aws-after-zero-conflicts.png`
- Create: `docs/assets/realtime-checkpoint-conflict/aws-after-ecs-two-tasks.png`
- Create: `docs/assets/realtime-checkpoint-conflict/local-two-node-report.png`
- Source: `docs/superpowers/evidence/document-two-node-scaling/aws-baseline-409-cloudshell.png`
- Source: `docs/superpowers/evidence/document-two-node-scaling/aws-after-zero-conflicts-cloudshell.png`
- Source: `docs/superpowers/evidence/document-two-node-scaling/aws-after-ecs-two-tasks.png`
- Source: `docs/superpowers/evidence/document-two-node-scaling/report.png`

**Interfaces:**
- Consumes: 검증 중 캡처한 원본 이미지 4개
- Produces: Case Study가 상대경로로 참조하는 공개용 PNG 4개

- [ ] **Step 1: 자산 디렉터리 생성과 비식별 대상 확인**

  `aws-baseline-409-cloudshell.png`에서 `documentId` 값 `22de0bf0-eb30-4af7-8d14-012ea6d3405f`만 비식별 대상임을 확인한다. 나머지 세 이미지에 AWS 계정 ID, ARN, 사용자 정보, 문서 ID, 인증 정보가 없는지 원본 해상도로 다시 확인한다.

- [ ] **Step 2: 개선 전 로그의 공개용 사본 생성**

  이미지 편집 도구로 `documentId`의 UUID 부분만 불투명 마스킹한다. 명령어, timestamp, log stream, event, status 409, expectedVersion 4, currentVersion 5는 그대로 보존하며 결과를 `aws-baseline-409-redacted.png`로 저장한다.

- [ ] **Step 3: 나머지 검증 이미지 복사**

  원본 바이트를 변경하지 않고 다음 이름으로 복사한다.

  ```text
  aws-after-zero-conflicts-cloudshell.png -> aws-after-zero-conflicts.png
  aws-after-ecs-two-tasks.png             -> aws-after-ecs-two-tasks.png
  report.png                              -> local-two-node-report.png
  ```

- [ ] **Step 4: 공개용 이미지 육안 검증**

  네 이미지를 원본 해상도로 열어 텍스트가 읽히는지, 409 로그의 문서 ID가 보이지 않는지, 다른 민감정보가 없는지 확인한다.

- [ ] **Step 5: 이미지 자산만 커밋**

  ```powershell
  git add -- docs/assets/realtime-checkpoint-conflict
  git commit -m "docs: add redacted realtime checkpoint evidence"
  ```

### Task 2: 공개 Case Study 작성

**Files:**
- Create: `docs/case-studies/realtime-checkpoint-conflict.md`
- Reference: `docs/superpowers/specs/2026-08-01-document-realtime-horizontal-scaling-design.md`
- Reference: `docs/superpowers/evidence/document-two-node-scaling/README.md`
- Reference: `docs/superpowers/evidence/2026-08-01-document-single-writer-e2e.md`

**Interfaces:**
- Consumes: Task 1의 공개용 PNG 상대경로와 PR `https://github.com/Developer-EJ/PILO/pull/1797`
- Produces: 이력서에서 직접 연결할 수 있는 GitHub Markdown 문서

- [ ] **Step 1: 제목과 요약 작성**

  제목은 `Realtime Server 수평 확장 시 발생한 문서 저장 충돌 해소`로 한다. 첫 문단은 “서버는 여러 대지만 동일 문서의 checkpoint는 한 번에 한 서버만 수행”한다는 문서 단위 저장 직렬화의 의미와 검증 범위를 3문장 이내로 설명한다.

- [ ] **Step 2: 문제와 원인 작성**

  다음 순서를 명확히 설명한다.

  ```text
  두 Realtime Server가 같은 문서의 동일 expectedVersion을 조회
  -> 각 인스턴스의 로컬 저장 큐가 독립적으로 checkpoint 요청
  -> 먼저 성공한 요청이 version을 증가
  -> 나중 요청이 이전 expectedVersion을 보내 409 Conflict
  ```

  “세션 상태 분리”, “데이터 유실”처럼 검증 범위 밖이거나 모호한 표현은 사용하지 않는다. 비식별화한 409 로그 이미지를 이 절에 삽입한다.

- [ ] **Step 3: 해결 구조 작성**

  Mermaid 흐름도로 `브라우저 -> Realtime Server A/B -> Redis Pub/Sub -> 문서별 Redis Lease -> App Server snapshot API -> PostgreSQL` 관계를 표시한다. 본문에서 Redis Pub/Sub은 Yjs 변경사항 동기화, 분산 Lease는 문서별 checkpoint 직렬화, 409 병합·재시도는 예외 상황 방어 역할이라고 구분한다. 1초 batching, graceful shutdown pending checkpoint 처리, Redis 비정상 시 health check 실패도 짧게 설명한다.

- [ ] **Step 4: AWS 검증 방법과 결과 작성**

  다음 표를 작성한다.

  | 항목 | 검증 조건/결과 |
  |---|---|
  | 환경 | 개발 ECS, Realtime Server 2대 |
  | 동시 접속 | 브라우저 5세션 |
  | 변경 입력 | 세션별 300개, 총 1,500개 |
  | 저장 오류 | `409 Conflict` 0건, checkpoint 저장 실패 0건 |
  | 재접속 확인 | 입력한 변경사항 1,500개 모두 유지 |

  `1,500회 편집`은 자동화된 고유 변경 입력 개수임을 표 아래에서 정의한다. 개선 후 오류 조회와 ECS task 2개 이미지를 삽입한다.

- [ ] **Step 5: 로컬 반복 테스트와 한계 작성**

  로컬 Docker 2노드 테스트는 5세션 x 300개 변경 x 3회, 총 4,500개이며 정상 경로 409 0건, persisted 4,500/4,500, fresh reconnect 4,500/4,500임을 별도 표로 작성한다. AWS 1,500개 결과와 합산하지 않는다. `local-two-node-report.png`를 삽입하고, 이 검증이 장시간 soak, 강제 종료, 네트워크 파티션 또는 모든 규모의 autoscaling을 증명하지는 않는다고 명시한다.

- [ ] **Step 6: 구현 근거 링크 작성**

  PR `#1797`과 다음 저장소 파일을 GitHub 상대링크로 연결한다.

  ```text
  apps/realtime-server/src/documents/document-redis-sync.ts
  apps/realtime-server/src/documents/document-checkpoint.service.ts
  apps/realtime-server/src/documents/document-hocuspocus.service.ts
  apps/realtime-server/src/documents/document-redis-sync.test.mjs
  apps/realtime-server/src/documents/document-checkpoint.service.test.mjs
  apps/realtime-server/scripts/document-two-node-scaling.e2e.mjs
  ```

  문서 끝에는 이력서에서 사용할 수 있는 3줄 요약을 문제·해결·결과 형식으로 제공한다.

- [ ] **Step 7: Case Study 본문만 커밋**

  ```powershell
  git add -- docs/case-studies/realtime-checkpoint-conflict.md
  git commit -m "docs: add realtime checkpoint conflict case study"
  ```

### Task 3: 공개 안전성과 링크 검증

**Files:**
- Verify: `docs/case-studies/realtime-checkpoint-conflict.md`
- Verify: `docs/assets/realtime-checkpoint-conflict/*.png`

**Interfaces:**
- Consumes: Task 1의 공개 이미지와 Task 2의 Markdown 문서
- Produces: 공개 가능한 문서와 검증 결과

- [ ] **Step 1: 민감정보 문자열 검사**

  ```powershell
  rg -n "22de0bf0-eb30-4af7-8d14-012ea6d3405f|arn:aws|AKIA|Bearer |683655334891" docs/case-studies docs/assets/realtime-checkpoint-conflict
  ```

  예상 결과는 출력 없음이다. PNG는 육안 검증 결과와 함께 확인한다.

- [ ] **Step 2: 상대경로 대상 검사**

  Markdown의 로컬 이미지와 문서 링크를 추출해 각 대상이 저장소 안에 존재하는지 확인한다. PR URL은 `https://github.com/Developer-EJ/PILO/pull/1797`과 정확히 일치해야 한다.

- [ ] **Step 3: Markdown 구조 검사**

  ```powershell
  rg -n "^# |^## |409 Conflict|1,500|4,500|pull/1797|```mermaid" docs/case-studies/realtime-checkpoint-conflict.md
  git diff --check
  ```

  제목, 핵심 절, 두 검증 수치, PR 링크, Mermaid 블록이 모두 출력되고 `git diff --check`는 성공해야 한다.

- [ ] **Step 4: 최종 변경 범위 검사**

  `git status --short`와 `git diff --stat origin/main...HEAD`를 확인한다. Case Study 설계·계획·본문·공개 이미지 외의 사용자 파일은 커밋되지 않아야 한다.

- [ ] **Step 5: 필요 시 검증 수정만 커밋**

  검증 과정에서 Case Study 또는 공개 이미지 링크를 수정한 경우 해당 파일만 명시적으로 스테이징하고 다음 메시지로 커밋한다.

  ```powershell
  git commit -m "docs: verify realtime checkpoint case study"
  ```
