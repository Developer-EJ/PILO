# PILO 기능 명세서 초안 검증 리포트 v1

검토 대상: `PILO 기능 명세서 초안.md`

검토 범위:
- 포함: Part 4, 5, 6, 9, 10, 11
- 제외: Part 7 DB 모델 초안

## 결론

현재 초안은 방향성은 좋아졌지만, 그대로 AI agent에게 구현 지시로 넘기면 다시 충돌이 날 가능성이 높다.

가장 큰 이유는 다음 세 가지다.

1. 같은 기능이 어떤 곳에서는 `Must`, 다른 곳에서는 `Should` 또는 `MVP 제외`로 적혀 있다.
2. Agent, GitHub, Task, Meeting, Canvas가 서로의 데이터를 직접 바꾸는 것처럼 읽히는 부분이 많다.
3. 화면 명세는 매우 상세하지만, 정작 구현자가 필요한 API 계약, 권한, 상태 전이, 승인 조건, 실패 조건이 아직 덜 닫혀 있다.

다만 dev를 버릴 정도는 아니다. 문서를 싹 밀기보다, 이 초안을 기준으로 **MVP 범위 재확정 -> 도메인 경계 확정 -> API/상태 계약 작성** 순서로 정리하면 회생 가능하다.

## P0. 바로 고쳐야 하는 모순

### 1. `회원가입` 표현과 OAuth-only 정책이 충돌한다

근거:
- 4.1: `회원가입, 로그인` Must
- 5.1: 이메일/비밀번호 회원가입 제외, OAuth 최초 로그인 시 User 자동 생성
- 6.1: `로그인 / 회원가입 화면`

문제:
- 구현자는 별도 회원가입 폼을 만들어야 하는지, OAuth 로그인만 만들면 되는지 헷갈린다.

수정안:
- `회원가입`이라는 표현을 MVP에서는 쓰지 않는다.
- 용어를 `OAuth 최초 로그인 및 사용자 자동 생성`으로 통일한다.

권장 문구:

```md
MVP에서는 별도 회원가입 화면을 제공하지 않는다.
사용자가 Google 또는 GitHub OAuth로 최초 로그인하면 User와 OAuthAccount를 자동 생성한다.
같은 provider + providerUserId로 다시 로그인하면 기존 User를 재사용한다.
서로 다른 provider 계정이 같은 사람인지 판단하거나 자동 병합하는 기능은 MVP에서 제외한다.
```

### 2. OAuth 계정 중복 정책이 내부적으로 충돌한다

근거:
- 5.1: `provider + providerUserId` 기준 중복 방지
- 5.1 수용 조건: GitHub 로그인한 김은재와 Gmail 로그인한 김은재는 같은 사람이어야 함, MVP 제외

문제:
- 같은 사람 자동 병합을 해야 하는지, 하지 말아야 하는지 모호하다.

수정안:
- MVP에서는 cross-provider account linking 제외를 명시한다.
- Google 계정과 GitHub 계정이 이메일이 같아도 자동 병합하지 않는다.

### 3. Workspace 상세/수정/삭제가 포함과 제외에 동시에 들어가 있다

근거:
- 5.2 주요 기능: Workspace 상세 조회, 수정, 보관/삭제는 MVP 제외
- 5.2 수용 조건: 상세 조회 가능, Owner 수정 가능
- 5.13 설정: Workspace 정보 수정/삭제가 Should
- 6.3 Dashboard는 Workspace 이름, 멤버, 역할 등 상세 정보 필요

문제:
- Dashboard와 권한 체크를 위해 최소 상세 정보는 필요하다.
- 반면 설정 화면에서 이름/설명 수정까지 구현할지는 별도 결정이다.

수정안:
- `WorkspaceSummary 조회`는 Must로 둔다.
- `Workspace 설정 수정/보관/삭제`는 MVP 제외 또는 Should로 명확히 한쪽만 선택한다.

권장 문구:

```md
Workspace Summary 조회는 Must이다.
Summary에는 id, name, description, type, status, myRole, memberCount를 포함한다.
Workspace 이름/설명 수정, 보관, 삭제, 멤버 역할 변경은 MVP에서 제외한다.
```

### 4. 팀원 초대가 이메일 초대인지 링크 초대인지 모호하다

근거:
- 5.2: Owner가 이메일 또는 초대 링크 기반으로 초대한다. 이메일로 초대는 MVP 제외
- 초대 정책: 초대는 이메일과 역할을 포함한다.

문제:
- 이메일 발송 시스템을 만들어야 하는지, token link만 만들면 되는지 불명확하다.

수정안:

```md
MVP 초대는 이메일 발송 없는 초대 링크 방식만 제공한다.
Owner는 초대 링크를 생성하고 외부 채널로 직접 공유한다.
선택적으로 inviteeEmail을 메모용으로 저장할 수 있지만, PILO가 이메일을 발송하지 않는다.
```

### 5. Agent 범위가 MVP치고 너무 크고, 제외 기능과 충돌한다

근거:
- 5.3 Agent Core: 프로젝트 맥락 저장/검색, 실행 로그 Must
- 5.3 호출 방식: 마이크 호출, 음성채팅 호출어, 회의 중 음성 조작 Must
- 4.2: 고도화된 음성 회의 transcript 제외
- 5.7: STT로 모든 회의 내용을 전사한다고 설명

문제:
- MVP에서 STT, 호출어, 음성 조작, 전체 맥락 검색까지 넣으면 구현 범위가 폭발한다.
- `텍스트 기반 회의 기록으로 검증 가능`이라는 제외 사유와 정면 충돌한다.

수정안:
- MVP Agent는 `텍스트 입력 + 현재 화면/선택 객체 context + 구조화된 제안 + 승인 후 저장`으로 제한한다.
- 음성/STT/call word는 Deferred로 내린다.
- 프로젝트 맥락 검색은 전체 RAG가 아니라 도메인별 조회 API를 통해 필요한 최소 데이터만 받도록 쓴다.

권장 문구:

```md
MVP Agent 호출 방식은 텍스트 입력만 지원한다.
마이크 버튼, 음성채팅 호출어, 회의 중 음성 조작, STT 기반 transcript 생성은 MVP에서 제외한다.
Agent는 직접 DB를 수정하지 않고, 각 도메인의 승인 API를 통해서만 데이터를 생성/수정한다.
```

### 6. GitHub Issue 생성/연결 정책이 세 곳에서 다르게 적혀 있다

근거:
- 5.3: GitHub Issue 생성 보조 MVP 제외
- 5.5: 개발 태그 Task는 GitHub Issue와 1:1 연결되어야 함
- 5.5 정책 수정 제안: 개발 Task는 Issue 연결 권장, 필수 아님
- 5.6: Issue 생성 Must, 기존 GitHub issue 연결 MVP 제외
- 6.6.10: Task에서 Issue 생성, 기존 Issue와 Task 연결 모두 포함

문제:
- 구현자가 `Issue 생성`, `기존 Issue 연결`, `개발 Task Issue 필수 여부`에서 모두 갈라진다.

권장 결정:
- `Task에서 GitHub Issue 생성`: Must
- `기존 GitHub Issue를 Task와 연결`: Must
- `개발 Task는 Issue 연결 권장`: Must policy
- `개발 Task는 Issue 연결 필수`: 하지 않음

권장 문구:

```md
개발 타입 Task는 GitHub Issue와 연결할 수 있어야 한다.
단, Issue 연결은 필수가 아니라 권장이다.
사용자는 Task에서 새 GitHub Issue를 생성하거나 기존 GitHub Issue와 연결할 수 있다.
GitHub Issue 상태가 closed가 되어도 Task 상태를 자동으로 Done으로 바꾸지 않고, 사용자에게 변경 제안만 표시한다.
```

### 7. GitHub 동기화가 자동인지 수동인지 충돌한다

근거:
- 5.3: GitHub 동기화 Must
- 5.6: Issue 상태를 Task에 반영 Must
- 5.5 정책 수정 제안: 자동 동기화하지 않고 수동 새로고침
- 6.6.10: 수동 동기화 포함, 실시간 양방향 동기화 제외

문제:
- Webhook 없이 자동 동기화를 하려면 polling 또는 백그라운드 job이 필요하다.
- MVP에서 구현 난이도가 높고 상태 충돌이 늘어난다.

수정안:
- MVP는 `사용자 수동 동기화 + 화면 진입 시 선택적 refresh`로 제한한다.
- 자동 상태 변경은 하지 않는다.

### 8. GitHub token 보안 설명에 해시가 섞여 있다

근거:
- 5.6 리스크: access token은 암호화 필요, 해시 함수 결과 저장 언급

문제:
- GitHub API 호출에 다시 써야 하는 access token은 해시하면 사용할 수 없다.

수정안:

```md
GitHub access token은 해시하지 않는다.
서버에서 복호화 가능한 방식으로 암호화하여 저장한다.
token 원문은 로그, 에러 응답, Agent context에 포함하지 않는다.
```

### 9. PR diff 크기 제한이 제외인데 성공 기준에는 필요하다고 되어 있다

근거:
- 5.6: PR diff 크기 제한 MVP 제외
- 9.3: PR diff가 너무 큰 경우에도 요약 가능한 범위 제한 정책이 존재

문제:
- Code Review Room이 Must라면 diff 제한 정책은 필수 안정장치다.

수정안:
- `고급 diff 분석`은 제외하되, `diff 크기 제한 정책`은 Must로 둔다.

권장 문구:

```md
MVP는 PR diff 분석에 파일 수, 총 변경 라인 수, 파일 크기 제한을 둔다.
제한을 초과하면 전체 분석 대신 변경 파일 목록과 제한 초과 안내를 제공한다.
```

### 10. Meeting Report가 텍스트 기반인지 STT 기반인지 충돌한다

근거:
- 4.2: 고도화된 음성 회의 transcript 제외
- 5.7: STT로 모든 내용을 전사
- 6.8: transcript와 원본 transcript 확인 기능 포함

문제:
- STT 기반 회의록은 별도 인프라, 오디오 저장 정책, 개인정보 동의, 실패 처리까지 필요하다.

권장 결정:
- MVP는 텍스트 메모, 회의 중 작성된 Agent chat, Canvas/Task 변경 이벤트 기반 Report만 지원한다.
- STT transcript는 MVP 제외.

### 11. 회의 종료가 Should인데 Report 생성은 Must다

근거:
- 5.7: 회의 종료 Should
- 5.7: Report 생성 Must
- 사용자 흐름: 회의 종료 후 Agent가 Report 후보 생성

문제:
- Report 생성의 트리거가 회의 종료라면 종료 액션은 Must다.

수정안:
- `회의 종료`를 Must로 올린다.

### 12. Canvas가 Should인지 Must인지 불명확하다

근거:
- 4.1: Canvas Should
- 5.8: Canvas Board 생성/조회, Memo, Task node, 연결선 등이 Must
- 10.3: Canvas는 메인 기능이 아니라 맥락 시각화 도구로 제한
- 11: 기본 Canvas가 최종 MVP 기능 요약에 포함

문제:
- 이 상태면 Canvas 담당자는 풀 Canvas를 만들고, 다른 담당자는 후순위로 볼 수 있다.

권장 결정:
- 제품 차별점이 Code Review Room이라면 Canvas는 `Should`로 유지하고 MVP 성공 기준에서 제외한다.
- 꼭 넣는다면 `Basic Canvas`만 Must로 정의하고 나머지는 제외한다.

Basic Canvas Must 범위 예시:

```md
Basic Canvas는 Workspace 안의 보드 생성/조회, Memo 노드, Task/Report/Issue/PR 참조 노드 배치, 노드 위치 저장, 노드 상세 패널, 원본 화면 이동만 포함한다.
Drawing, Frame, Code Block, Vote, File, Code Reference, Agent 자동 배치, 실시간 협업은 MVP에서 제외한다.
```

### 13. 공유 드라이브 제외와 Canvas File 노드가 충돌한다

근거:
- 4.2/5.12: 공유 드라이브 MVP 제외
- 5.8/6.7: File 노드, 이미지/PDF, Shared File 참조 포함

수정안:
- MVP Canvas에서 File 노드는 제외한다.
- 또는 URL 메모 수준으로 제한한다.

### 14. Code Reference 노드 Must는 범위가 과하다

근거:
- 5.8: Code Reference 노드 Must
- Code Reference는 코드 파일, 함수, 라인 범위, 리뷰 지점 참조

문제:
- GitHub 파일 브라우징, diff line mapping, review node와 연결되어 범위가 커진다.

수정안:
- MVP Canvas에서는 Code Reference 제외.
- Code Review Room 내부에서만 PR 파일/diff reference를 다룬다.

### 15. Code Review Room의 리뷰 결과 저장이 제외와 포함에 동시에 있다

근거:
- 5.3: PR 리뷰 결과 저장 MVP 제외
- 5.9: 리뷰 판단 Must
- 6.6 흐름: 리뷰 결과는 PR 상세 패널에 반영

문제:
- 리뷰 판단을 UI에서만 하는지, 저장까지 하는지 불명확하다.

권장 결정:
- MVP에서는 내부 ReviewSession에 `문제 없음 / 논의 필요 / 판단 불가`를 저장한다.
- GitHub 댓글 작성, GitHub 리뷰 승인/거절은 제외한다.

### 16. Merge 관련 흐름이 충돌한다

근거:
- 5.9 사용자 흐름: `Merge를 진행한다`
- 5.9 MVP: Merge 기능 제공 안 함
- 10.2: Merge는 GitHub에서 수행

수정안:
- `Merge를 진행한다`를 `GitHub 원본 PR로 이동한다`로 수정한다.

### 17. Chat 기능에서 Agent 메시지 전송이 제외로 되어 있다

근거:
- 5.10: MVP에서는 Agent 호출용 챗봇형 채팅 제공
- 5.10 주요 기능: `메시지 전송 (Agent only)` MVP 제외
- 6.10: 메시지 입력/전송, Agent 응답 카드 상세 명세

문제:
- Agent 호출을 하려면 최소 텍스트 메시지 전송은 Must다.

수정안:

```md
MVP 채팅은 사용자 간 팀 채팅이 아니라 Agent Command Chat이다.
Agent에게 텍스트 메시지를 보내고 응답을 받는 기능은 Must이다.
사용자 간 실시간 채팅, 멘션, 읽음 표시, 파일 첨부는 MVP에서 제외한다.
```

### 18. Notification이 Should인지 Must인지 충돌한다

근거:
- 4.1: 알림 Should
- 5.3: 알림 생성 Must
- 5.11: Task 담당자 지정 Must
- 6.11: 완전한 알림 센터 수준
- 11: 기본 알림 포함

문제:
- 알림 센터 전체를 만들지, 대시보드 카드만 만들지 불명확하다.

권장 결정:
- MVP Must: Agent 승인 대기/Task 담당자 지정 같은 `in-app notification` 최소 목록
- Should: 읽음 관리, 필터, 전체 알림 센터

### 19. Settings 범위가 Workspace 정책과 충돌한다

근거:
- 5.2: Workspace 수정/삭제/멤버 역할 관리 제외
- 5.13: Workspace 수정/삭제/팀원 관리 Should, GitHub Repository 관리 Must

수정안:
- Settings MVP는 GitHub Repository 연결/재연결 화면 진입만 Must.
- Workspace 수정/삭제, 멤버 제거/역할 변경, 알림 설정, Agent 설정은 제외한다.

## P1. 모호해서 계약으로 닫아야 하는 부분

### 1. `Must / Should / Could / MVP 제외` 기준이 문서 전체에 없다

수정안:

```md
Must: MVP 완료 기준에 포함되며, 구현/테스트/API 계약이 필요하다.
Should: 가능하면 구현하되 MVP 완료를 막지 않는다. API 계약은 후속으로 분리한다.
Could: 아이디어 수준이며 이번 구현 대상이 아니다.
MVP 제외: 구현하지 않으며 화면에 CTA나 빈 상태 이상의 동작을 만들지 않는다.
```

### 2. Task 타입, 라벨, 우선순위가 섞여 있다

근거:
- 5.5: taskType 비어 있음
- 5.5: Task 라벨 `개발 / 회의 / 기획`
- 6.5: 라벨이 기획, 디자인, 프론트엔드, 백엔드, DB, 인프라, AI/Agent 등으로 확장

수정안:
- `taskType`: `development | planning | meeting | review | document | bug | etc`
- `labels`: 자유 태그 또는 사전 정의 태그
- GitHub Issue 권장은 `taskType = development`일 때만 적용

### 3. `Blocked`는 상태인지 별도 플래그인지 정해야 한다

현재 문서에는 `status = Blocked`와 `Blocked 여부`가 함께 나온다.

권장:
- 단순 MVP에서는 `Blocked`를 status에 포함한다.
- blockedReason은 선택 필드로 둔다.

### 4. `Channel`이라는 용어가 정의 없이 나온다

근거:
- 6.5 Task 화면: Workspace/Channel 이름

수정안:
- MVP에 Channel이 없으면 제거한다.
- 모든 데이터 기준을 Workspace로 통일한다.

### 5. Agent Action, Planning Draft, ProjectProfile 같은 객체가 화면에만 나온다

근거:
- 6.11: Agent Action 화면, Planning Draft 화면
- 5.4/6.4: ProjectBrief는 상세하지만 저장/수정/조회 계약이 없음

수정안:
- MVP 객체 목록에 포함하거나, 화면 문구에서 제거한다.
- ProjectBrief는 프로젝트 시작 가이드 산출물로 Must라면 저장/조회/수정 정책이 필요하다.

### 6. 권한 매트릭스가 도메인별로 부족하다

필요한 최소 결정:
- Owner만 가능한 작업
- Member도 가능한 작업
- Viewer 제외 여부
- 비멤버 접근 시 에러 코드
- GitHub 권한이 없는 Workspace Member가 볼 수 있는 데이터 범위

권장:
- MVP 역할은 `Owner`, `Member`만 둔다.
- Viewer는 문서에서 제거하거나 Future Role로 분리한다.

### 7. API 계약이 아직 부족하다

각 도메인마다 최소 다음이 필요하다.

```md
Endpoint
Method
Auth required
Workspace membership required
Request body
Response body
Error cases
Permission rules
Side effects
```

### 8. Agent 구조화 출력 schema가 필요하다

현재는 `TaskCandidate`, `PRSummary`, `ReviewGraph` 같은 이름만 있다.

AI agent 구현용으로는 각 산출물에 JSON schema가 필요하다.

예:

```json
{
  "type": "task_candidate",
  "title": "string",
  "description": "string",
  "taskType": "development",
  "assigneeId": "string|null",
  "dueDate": "ISO date|null",
  "acceptanceCriteria": ["string"],
  "source": {
    "type": "project_start|meeting|chat|github",
    "id": "string|null"
  }
}
```

## P2. 문서 구조 정리 필요

1. `## 6.6 GitHub 연동 화면`이 중복되어 있다.
2. `## PR 연결(db 설계시 참고)`, `## 가장 중요한 리스크`, `## 1. GitHub 토큰 권한과 보안`은 5.6 하위 heading으로 정리해야 한다.
3. 6.7은 parent heading 없이 `6.7.1`, `6.7.2`만 있다.
4. 6.8 `### 주요 요소`가 두 번 나온다.
5. 6.9 Code Review Room 화면은 다른 화면에 비해 너무 짧다.
6. Part 7을 제외하면 `# 8`이 없다.
7. `정책 수정 제안`, `db 설계시 참고` 같은 초안 메모는 최종 명세에서 제거하거나 Appendix로 이동해야 한다.

## 권장 MVP 범위 v1

아래처럼 먼저 범위를 고정하는 것을 추천한다.

| 도메인 | MVP Must | MVP 제외 |
| --- | --- | --- |
| Auth | Google/GitHub OAuth login, session cookie, `/auth/me`, logout | email/password, profile edit, cross-provider merge |
| Workspace | create, list, summary, invite link create/accept, member list, membership guard | workspace edit/delete/archive, role change, viewer role |
| Project Start Agent | text-based guided questions, ProjectBrief, tech stack recommendation, feature split, task candidates, user approval | voice input, call word, autonomous execution, long-term personalization |
| Task | CRUD, status, assignee, due date, priority, taskType, acceptance criteria, Agent candidate approval | comments, history, advanced calendar |
| GitHub | GitHub integration separate from login, one repo per workspace, manual sync, issue list, create issue from task, link existing issue, PR list/detail, PR-task/issue link | webhook, multi-repo, GitHub Projects, issue body edit, PR body edit, service merge, GitHub comments |
| Meeting Report | text notes, meeting start/end, ReportDraft, user edit/confirm, action item to Task | STT transcript, audio recording, voting |
| Code Review Room | PR summary, changed file list, diff viewer, file-level graph, review questions, internal review decisions, checklist, diff size limit | GitHub review comments, approval/reject, merge, deep security detection |
| Agent Chat | Agent-only text command chat, response cards, approval cards | user-to-user chat, realtime chat, mentions, files, threads |
| Notification | minimal in-app notifications for assigned task and pending Agent approval | full notification center filters, chat mention, notification settings |
| Canvas | decide one: Basic Canvas Must or Canvas Should. Recommended: Basic Canvas Should unless product insists | file nodes, code reference nodes, drawing/frame/vote, real-time collaboration, agent auto layout |
| Settings | GitHub repo connection entry point | workspace edit/delete, member removal, role management, notification/agent settings |

## 도메인 경계 규칙

AI agent 협업을 안정화하려면 이 규칙을 기능 명세 앞쪽에 넣어야 한다.

```md
각 도메인은 자기 원본 데이터만 소유한다.
Agent는 어떤 도메인 데이터도 직접 저장하지 않는다.
Agent가 만든 산출물은 candidate/draft 상태로 저장하고, 사용자가 승인하면 해당 도메인의 API가 실제 데이터를 생성한다.
Canvas는 Task, Report, Issue, PR 원본을 복사하지 않고 참조 노드만 저장한다.
Dashboard와 Notification은 여러 도메인의 데이터를 읽어 요약하지만 원본 상태를 변경하지 않는다.
GitHub 도메인은 GitHub Issue/PR metadata를 소유하고, Task 도메인은 Task 상태를 소유한다.
GitHub 상태 변경이 Task 상태를 자동 변경하지 않고, 사용자에게 변경 제안만 만든다.
```

## AI agent에게 넘기기 전 필수 체크리스트

- [ ] 모든 기능이 `Must / Should / Could / MVP 제외` 중 하나로만 분류되어 있다.
- [ ] 같은 기능이 포함/제외에 동시에 존재하지 않는다.
- [ ] 각 Must 기능에 API 계약 또는 화면-only 여부가 적혀 있다.
- [ ] 각 데이터 변경 작업에 승인 필요 여부가 적혀 있다.
- [ ] Owner/Member 권한이 도메인별로 적혀 있다.
- [ ] 상태 enum과 상태 전이 규칙이 적혀 있다.
- [ ] GitHub token 저장/동기화/실패 정책이 적혀 있다.
- [ ] Agent 출력 JSON schema가 적혀 있다.
- [ ] MVP 제외 기능은 화면에서 숨길지, disabled CTA로 보여줄지 결정되어 있다.
- [ ] 성공 기준은 Must 기능만 포함한다.

## 최종 판단

이 초안은 “기능 아이디어 문서”로는 충분히 좋아졌다. 하지만 “5명이 AI agent로 구현할 계약 문서”로는 아직 닫히지 않았다.

다음 작업은 새 문서를 더 추가하는 것이 아니라, 이 초안을 기반으로 다음 세 문서를 얇게 분리하는 것이다.

1. `mvp-scope-v1.md`: Must/Should/Excluded만 결정
2. `domain-boundary-v1.md`: 소유권, 권한, cross-domain 규칙
3. `api-contract-v1.md`: 도메인별 endpoint와 request/response

이 세 문서가 먼저 닫히면, DB 설계는 그 다음에 들어가는 것이 맞다.
