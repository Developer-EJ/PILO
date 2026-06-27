# PILO 5인 분업 상세 명세

## 개요

PILO 프로젝트는 인프라를 별도 담당으로 분리하고, 5명의 개발자가 제품 도메인 단위로 기능을 나누어 개발한다.

이 문서의 목적은 각 담당자가 어떤 기능을 소유하고, 어떤 데이터를 책임지며, 다른 담당자와 어떤 계약으로 연결되는지 명확히 하는 것이다.

## 공통 원칙

- 각 담당자는 자기 도메인의 화면, API, DB 모델, 비즈니스 로직, 테스트를 책임진다.
- 서버 단위가 아니라 도메인 단위로 분리한다.
- 다른 도메인의 데이터를 직접 수정하지 않고, 해당 도메인의 API, 이벤트, read model 또는 계약을 통해 연동한다.
- AI Agent는 공통 실행 구조와 도메인별 Workflow를 분리한다.
- E는 공통 Agent Runtime과 Orchestrator를 담당한다.
- A, B, C, D는 자기 기능에서 필요한 Agent Workflow를 담당한다.

## 담당자 요약

| 담당자 | 영역 | 핵심 책임 |
|---|---|---|
| A 동현 | Workspace / Dashboard / Canvas | 프로젝트 공간, 홈, 시각화, 전체 현황 |
| B 주형 | Task / GitHub / Progress | 작업 관리, GitHub 연동, 진행률 |
| C 진호 | Meeting / Voice / Report | 회의, 음성, 회의록, 액션 아이템 |
| D 은재 | Code Review Room / PR Analysis | PR 분석, 코드 리뷰, 변경사항 이해 |
| E 세인 | Multi-Agent Orchestrator / Agent Runtime / Project Planning | 공통 AI 실행 구조, Agent 계약, 프로젝트 계획 |

---

# A 동현: Workspace / Dashboard / Canvas

## 1. 담당 목표

동현은 사용자가 PILO에 들어왔을 때 가장 먼저 마주하는 프로젝트 작업 공간을 담당한다.

핵심 역할은 프로젝트를 한눈에 보고, 주요 기능으로 진입하고, 전체 구조를 시각적으로 이해할 수 있게 만드는 것이다.

## 2. 주요 기능

### Workspace

- Workspace 생성
- Workspace 목록 조회
- Workspace 상세 진입
- Workspace 이름 및 설명 수정
- 팀원 초대 UI
- 멤버 목록 표시
- 멤버 역할 표시
- Workspace 설정 화면
- 현재 선택된 Workspace 상태 관리

### Dashboard

- 프로젝트 홈 화면
- 전체 진행률 표시
- 진행 중 Task 요약
- 지연 Task 요약
- 최근 회의록 요약
- 최근 PR 및 리뷰 필요 PR 요약
- 다음 마일스톤 표시
- 팀원별 담당 Task 현황
- Agent가 추천한 다음 액션 표시
- 회의 시작, Task 보기, PR 리뷰 보기, Canvas 보기 진입 버튼

### Canvas

Canvas는 직접 업무를 처리하는 곳이라기보다 프로젝트 구조를 시각화하는 영역이다.

- Task 노드 표시
- 회의록 노드 표시
- PR 노드 표시
- GitHub Issue 노드 표시
- 문서 및 파일 노드 표시
- 노드 간 관계 표시
  - 회의록 -> 생성된 Task
  - Task -> GitHub Issue
  - Task -> PR
  - PR -> Code Review Room
- 노드 클릭 시 상세 패널 표시
- 필터 제공
  - Task만 보기
  - Meeting만 보기
  - PR만 보기
  - 특정 담당자 기준 보기
  - 지연 항목만 보기
- Canvas 줌 및 이동
- 노드 위치 저장
- 자동 배치 기본 지원

## 3. 소유 데이터

- Workspace
- WorkspaceMember
- DashboardPreference
- CanvasNodePosition
- CanvasViewSetting

Task, Meeting, PR 데이터 자체는 각각 B, C, D가 소유한다. 동현은 이 데이터를 조회해서 보여주는 역할을 맡는다.

## 4. 다른 담당자와의 연결

- B에게서 Task, GitHub Issue, Progress 데이터 수신
- C에게서 Meeting Report 데이터 수신
- D에게서 PR Analysis 요약 데이터 수신
- E에게서 Agent 추천 액션과 프로젝트 계획 요약 데이터 수신

## 5. 침범하지 않는 영역

- Task 생성 및 상태 변경 로직
- GitHub API 연동
- 회의록 생성 로직
- PR 코드 분석 로직
- Agent 실행 로직

---

# B 주형: Task / GitHub / Progress

## 1. 담당 목표

주형은 PILO의 실제 작업 관리와 GitHub 연결을 담당한다.

핵심 역할은 프로젝트가 실제로 얼마나 진행되고 있는지 계산하고, Task와 GitHub Issue 및 PR을 연결하는 것이다.

## 2. 주요 기능

### Task 관리

- Task 생성
- Task 수정
- Task 삭제
- Task 상세 조회
- Task 목록 조회
- 담당자 지정
- 상태 변경
  - Todo
  - In Progress
  - In Review
  - Done
  - Blocked
- 우선순위 설정
- 마감일 설정
- Task 설명 및 체크리스트 관리
- Task 댓글 또는 활동 로그
- Task를 마일스톤에 연결
- Task 간 의존성 설정
- Agent가 생성한 Task 후보 승인 및 거절

### GitHub 연동

- GitHub OAuth 또는 GitHub App 연결
- Repository 선택
- Repository 정보 저장
- Task에서 GitHub Issue 생성
- GitHub Issue와 Task 동기화
- Issue 상태 변경 감지
- PR 목록 조회
- PR과 Task 연결
- GitHub Label 및 Assignee 매핑
- GitHub Webhook 수신
  - Issue opened
  - Issue closed
  - PR opened
  - PR merged
  - PR review requested

### Progress

- 전체 진행률 계산
- 마일스톤별 진행률 계산
- 담당자별 진행률 계산
- 지연 Task 탐지
- Blocked Task 탐지
- 리뷰 대기 Task 탐지
- 진행률 히스토리 저장
- Dashboard에 전달할 요약 데이터 제공

## 3. 소유 데이터

- Task
- TaskStatus
- TaskComment
- TaskDependency
- Milestone
- GitHubConnection
- GitHubRepository
- GitHubIssueMapping
- GitHubPrMapping
- ProgressSnapshot

## 4. Agent Workflow

주형은 Task와 GitHub 영역의 Agent Workflow를 담당한다.

- 회의록에서 나온 Action Item을 Task 후보로 변환
- 프로젝트 계획에서 나온 기능 목록을 Task로 분해
- 지연 Task 원인 분석
- 다음 작업 추천
- GitHub Issue 제목 및 본문 자동 생성

공통 Agent 실행 구조는 E가 제공한다.

## 5. 다른 담당자와의 연결

- A에게 Dashboard 및 Canvas용 Task 요약 제공
- C에게 회의록 기반 Task 생성 API 제공
- D에게 PR과 연결된 Task 정보 제공
- E에게 Task 생성 및 수정 Action Contract 제공

## 6. 침범하지 않는 영역

- Canvas 시각화
- 회의 음성 및 회의록 생성
- PR 코드 분석
- 공통 Agent Runtime

---

# C 진호: Meeting / Voice / Report

## 1. 담당 목표

진호는 PILO의 회의 경험 전체를 담당한다.

핵심 역할은 회의를 시작하고, 음성 또는 텍스트 기록을 남기고, 회의록과 결정사항 및 액션 아이템을 만드는 것이다.

## 2. 주요 기능

### Meeting

- 회의방 생성
- 회의 목록 조회
- 회의 상세 조회
- 회의 시작 및 종료
- 회의 제목, 목적, 참석자 관리
- 회의 아젠다 표시
- 회의 중 메모 작성
- 회의 상태 관리
  - Scheduled
  - In Progress
  - Ended
  - Report Generated

### Voice

- 음성채팅방 생성
- 참여자 입장 및 퇴장
- 마이크 on/off 상태
- 현재 말하는 사람 표시
- 회의 세션과 음성방 연결
- STT 연결 구조 준비
- 녹음 여부 상태 관리
- 실시간 Transcript 저장 또는 chunk 저장

MVP에서는 다음 범위부터 시작한다.

- 회의방 생성
- 참여자 입장
- 음성 연결
- 텍스트 Transcript 저장
- 종료 후 회의록 생성

### Report

- 회의록 생성
- 회의 요약
- 결정사항 추출
- 액션 아이템 추출
- 리스크 및 이슈 추출
- 다음 회의 아젠다 제안
- 회의록 수정
- 회의록 공유
- 회의록에서 Task 후보 생성 요청
- 회의록과 Task 연결 표시

## 3. 소유 데이터

- Meeting
- MeetingParticipant
- MeetingAgenda
- MeetingTranscript
- MeetingReport
- MeetingDecision
- MeetingActionItem
- VoiceRoom
- VoiceSession

## 4. Agent Workflow

진호는 회의와 회의록 영역의 Agent Workflow를 담당한다.

- 회의 Transcript 요약
- 결정사항 추출
- 액션 아이템 추출
- 다음 회의 아젠다 생성
- 회의 중 Agent 호출
  - 방금 결정된 내용 정리
  - 현재 논의를 Task 후보로 변환
  - 빠진 리스크 확인

실제 Task 저장은 B의 API를 호출해야 한다.

## 5. 다른 담당자와의 연결

- B에게 Action Item에서 생성된 Task 후보 전달
- A에게 최근 회의록과 결정사항 요약 제공
- E의 Agent Runtime을 사용해서 회의록 생성 Workflow 실행
- Canvas에 표시할 Meeting Node 데이터를 A에게 제공

## 6. 침범하지 않는 영역

- Task DB 직접 저장
- GitHub Issue 생성
- Canvas 레이아웃
- PR 분석
- 공통 Agent Orchestrator

---

# D 은재: Code Review Room / PR Analysis

## 1. 담당 목표

은재는 PILO의 코드 리뷰 경험을 담당한다.

핵심 역할은 GitHub PR을 가져와 변경사항을 분석하고, 리뷰어가 이해하기 쉽게 구조화하는 것이다.

## 2. 주요 기능

### Code Review Room

- PR 목록에서 리뷰룸 생성
- 리뷰룸 상세 화면
- PR 기본 정보 표시
  - 제목
  - 작성자
  - 상태
  - 브랜치
  - 연결된 Task
- PR 변경 파일 목록 표시
- Diff Viewer
- 파일별 변경 요약
- 리뷰 코멘트 작성
- 리뷰 질문 생성
- 리뷰 체크리스트 표시
- 리뷰 완료 상태 관리

### PR Analysis

- PR 목적 요약
- 변경된 파일 분석
- 변경된 함수 및 컴포넌트 분석
- API 변경점 분석
- DB 및 Schema 변경점 탐지
- 위험도 분석
- 테스트 필요 영역 추천
- 사이드 이펙트 후보 표시
- 잠재 버그 탐지
- 리뷰 우선순위 추천
- Merge 전 체크리스트 생성
- 리뷰 결과 요약

### Graph / Map

은재는 PR 내부 분석 그래프를 담당한다.

- 변경 파일 그래프
- 함수 호출 관계
- API 영향 범위
- 파일 간 의존 관계
- Task -> PR -> 변경 파일 흐름

전체 프로젝트 Canvas는 A가 담당하고, D는 PR 내부 분석 그래프만 담당한다.

## 3. 소유 데이터

- CodeReviewRoom
- PullRequestAnalysis
- ChangedFile
- ChangedFunction
- ReviewComment
- ReviewQuestion
- ReviewChecklist
- ReviewRisk
- ReviewSummary

## 4. Agent Workflow

은재는 PR 분석 영역의 Agent Workflow를 담당한다.

- PR 요약
- Diff 분석
- 변경 의도 추론
- 위험 코드 탐지
- 테스트 추천
- 리뷰 질문 생성
- Merge 가능성 판단 보조
- Reviewer용 설명 생성

GitHub PR 원본 데이터는 B가 연동하고, D는 그 데이터를 받아 분석한다.

## 5. 다른 담당자와의 연결

- B에게 PR 원본 정보와 Task 연결 정보 수신
- A에게 리뷰 필요 PR 요약 제공
- E의 Agent Runtime으로 PR 분석 실행
- Canvas에 표시할 PR Analysis 요약 제공

## 6. 침범하지 않는 영역

- GitHub OAuth 및 Repository 연결
- Task 관리
- 전체 Canvas
- 회의록 생성
- 공통 Agent Runtime

---

# E 세인: Multi-Agent Orchestrator / Agent Runtime / Project Planning

## 1. 담당 목표

세인은 PILO의 AI Agent 시스템 전체의 공통 기반을 담당한다.

핵심 역할은 단순한 프롬프트 작성이 아니라, Agent를 어떻게 호출하고, 어떤 Context를 넣고, 어떤 Action을 반환하며, 반환된 Action을 어떻게 승인 및 실행할지 설계하는 것이다.

## 2. 주요 기능

### Agent Runtime

- Agent 호출 API
- Agent Registry
- Agent Workflow 등록 구조
- 공통 Request Schema
- 공통 Response Schema
- Action Contract
- Tool Calling 구조
- Context Builder
- Agent 실행 로그
- Agent 실행 상태 관리
  - Pending
  - Running
  - Succeeded
  - Failed
  - Requires Confirmation
- 재시도 처리
- 에러 처리
- 토큰 사용량 기록
- Agent 결과 저장

### Multi-Agent Orchestrator

- 사용자 요청 Intent 분류
- 적절한 Agent 선택
- 여러 Agent 순차 실행
- 여러 Agent 결과 병합
- Agent 간 Context 전달
- Action 실행 전 사용자 확인
- 도메인별 API 호출 연결
- 비동기 작업 큐 연결 구조
- 장기 실행 작업 상태 조회

예시 흐름:

사용자가 "이번 회의 내용 바탕으로 Task 만들고 일정도 잡아줘"라고 요청한다.

1. C의 Meeting Report Workflow 호출
2. Action Item 추출
3. B의 Task Draft Workflow 호출
4. Milestone 초안 추천
5. 사용자에게 확인 요청
6. 승인되면 B의 Task API 호출
7. A Dashboard 및 Canvas에 반영될 수 있도록 이벤트 발생

### Project Planning

PILO의 핵심 온보딩 기능이다.

- 프로젝트 목표 질문
- 사용자 답변 기반 요구사항 정리
- 기술스택 추천
- MVP 범위 추천
- 기능 목록 생성
- 기능 우선순위 추천
- 역할 분배 추천
- 마일스톤 초안 생성
- 초기 Task 후보 생성
- 첫 회의 아젠다 생성
- 프로젝트 리스크 도출
- 최종 계획 승인 Flow

## 3. 소유 데이터

- Agent
- AgentWorkflow
- AgentRun
- AgentRunStep
- AgentContext
- AgentAction
- AgentTrace
- ProjectPlanDraft
- TechStackRecommendation
- FeatureBreakdown
- RoleAssignmentDraft
- MilestoneDraft

MilestoneDraft는 프로젝트 계획 단계에서 생성되는 초안 데이터이며, 사용자가 승인하기 전까지 E가 소유한다. 승인 이후 실제 Task와 Milestone으로 저장되는 데이터는 B가 소유하고, B의 Task / Milestone API를 통해 생성한다.

## 4. 공통 계약 예시

세인은 A, B, C, D가 각자 Agent Workflow를 만들 수 있도록 공통 계약을 잡아야 한다.

```json
{
  "type": "task.create.draft",
  "source": "meeting.report",
  "confidence": 0.87,
  "requiresConfirmation": true,
  "payload": {
    "title": "GitHub OAuth 연결 구현",
    "description": "사용자가 GitHub 계정을 연결하고 Repository를 선택할 수 있게 한다.",
    "assigneeId": "user_123",
    "priority": "high",
    "dueDate": "2026-07-03"
  }
}
```

이 구조가 있어야 C가 회의록에서 Task 후보를 뽑아도 B가 안정적으로 받을 수 있다.

## 5. 다른 담당자와의 연결

- A에게 Agent 추천 액션 제공
- B에게 Task 생성 및 진행률 분석 Action 전달
- C에게 회의록 요약 Workflow 실행 구조 제공
- D에게 PR 분석 Workflow 실행 구조 제공
- 전체 팀에게 Agent Contract 문서 제공

## 6. 침범하지 않는 영역

- Workspace 화면
- Task CRUD 전체
- GitHub 연결 전체
- 회의 UI
- PR Diff Viewer
- Canvas UI

---

# 기능 간 경계

## Project Start Flow

- E: 질문, 추천, 계획 생성
- A: 온보딩 화면과 결과 표시
- B: 승인된 Task 및 Milestone 저장
- C: 첫 회의 아젠다 연결
- D: 관여 없음

## Meeting -> Task Flow

- C: 회의 진행, 회의록 생성, Action Item 추출
- E: Agent Workflow 실행과 Action Contract 변환
- B: Task 후보 저장, 승인, 생성
- A: Dashboard 및 Canvas에 표시
- D: 관여 없음

## Task -> GitHub Issue Flow

- B: Task와 Issue 생성 및 동기화
- A: Dashboard 및 Canvas 표시
- E: Issue 본문 초안 생성 Agent 지원 가능
- C, D: 관여 없음

## PR Review Flow

- B: PR 목록과 Task 연결 정보 제공
- D: PR 분석과 Code Review Room
- E: PR Analysis Agent 실행 구조 제공
- A: 리뷰 필요 PR 요약 표시
- C: 관여 없음

## Project Progress Check Flow

- B: 진행률 계산
- A: Dashboard 표시
- E: 다음 액션 추천
- C: 최근 회의록 반영
- D: 리뷰 병목 반영

---

# MVP 우선순위

## A 동현

- Workspace Home
- Dashboard 요약
- 기본 Canvas node/edge
- Task, Report, PR 노드 표시

## B 주형

- Task CRUD
- GitHub Repository 연결
- Task -> Issue 생성
- PR과 Task 연결
- Progress Summary

## C 진호

- 회의 시작 및 종료
- 텍스트 회의 메모
- 회의록 생성
- 결정사항 및 Action Item 추출
- 음성방 생성 및 참여 기본 기능

## D 은재

- PR 가져오기
- PR 요약
- 변경 파일 목록
- Diff Viewer
- 리뷰 체크리스트
- PR 분석 결과 표시

## E 세인

- Agent 공통 Schema
- Agent Registry
- Intent Router v1
- Project Planning Workflow
- Action Confirmation
- Agent Trace Log

---

# 결론

이 분업은 기능이 서로 겹치지 않으면서도 PILO의 핵심 흐름을 모두 커버한다.

가장 중요한 기준은 다음과 같다.

- A는 보여주는 사람
- B는 작업과 GitHub를 실제로 움직이는 사람
- C는 회의에서 정보를 뽑는 사람
- D는 PR을 이해시키는 사람
- E는 Agent가 안정적으로 일하게 만드는 사람

이 기준을 지키면 각자가 동시에 개발해도 서로 침범할 가능성이 낮다.
