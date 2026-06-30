# PILO Domain Boundary v1

이 문서는 PILO MVP에서 각 도메인이 소유하는 데이터, 허용된 접근 방식, 금지된 접근 방식을 정의한다.
5명이 각자 AI agent로 구현할 때 이 문서의 경계를 넘지 않는 것이 목표다.

함께 읽을 문서:

- `docs/mvp-scope-v1.md` - MVP 포함/제외 범위.
- `docs/api-contract-v1.md` - 도메인별 public API.
- `docs/collaboration-v1.md` - PR, contract, DB 변경 규칙.
- `docs/mvp-contract-v0.md` - 현재 `dev` 구현 상태표.

## Absolute Rules

1. 각 도메인은 자기 원본 데이터만 소유한다.
2. 다른 도메인의 DB table, repository, service를 직접 import하거나 join하지 않는다.
3. 다른 도메인 데이터 조회는 public API, read model, fixture adapter만 사용한다.
4. 다른 도메인 데이터 변경은 owner API 또는 Agent approval action을 통해서만 요청한다.
5. Agent는 원본 데이터를 직접 생성/수정/삭제하지 않는다.
6. Dashboard, Canvas, Notification은 원본 데이터를 소유하지 않는다.
7. GitHub metadata와 PILO Task 상태는 서로 다른 source of truth다.
8. RAG/embedding index는 MVP 도메인으로 만들지 않는다.
9. Workspace membership guard는 모든 Workspace-scoped API의 선행 조건이다.
10. Contract에 없는 field, enum, endpoint를 agent가 임의로 추가하지 않는다.

## Domain Owners

| Owner | Domain | Primary responsibility |
| --- | --- | --- |
| 동현 | Auth / Workspace / Canvas | 로그인, 세션, Workspace, 멤버십, 초대, Basic Canvas |
| 주형 | Task / GitHub / Progress | Task, Task candidate approval, GitHub repo/issue/PR metadata, progress summary |
| 진호 | Meeting / Voice / Report | Meeting session, voice session, transcript, text note, ReportDraft, Action Item |
| 은재 | Code Review Room | ReviewSession, PR analysis, review graph, checklist |
| 세인 | Agent Runtime / Planning | Agent run, approval action, project start guide, structured AI output |

## Source Of Truth

| 데이터 | Owner domain | Source of truth | Consumer access |
| --- | --- | --- | --- |
| User | Auth | Auth DB/API | Current user API |
| OAuthAccount | Auth | Auth DB/API | Auth only |
| AuthSession | Auth | Auth DB/API | Session guard |
| Workspace | Workspace | Workspace DB/API | Workspace summary API |
| WorkspaceMember | Workspace | Workspace DB/API | Membership guard/read model |
| WorkspaceInvite | Workspace | Workspace DB/API | Invite accept API |
| ProjectBrief | Agent/Planning | Planning DB/API | Project start API |
| Task | Task | Task DB/API | Task API/read model |
| TaskDraft | Task | Draft API until approval | Task draft approval API |
| GitHubConnection | GitHub | GitHub integration DB/API | Connection status API |
| GitHubRepository | GitHub | GitHub integration DB/API | Repository API |
| GitHubIssue | GitHub | GitHub metadata DB/API | Issue API/read model |
| GitHubPullRequest | GitHub | GitHub metadata DB/API | PR API/read model |
| MeetingSession | Meeting | Meeting DB/API | Meeting API |
| VoiceSession | Meeting/Voice | Meeting DB/API | Voice API |
| TranscriptSegment | Meeting/Voice | Meeting DB/API | Report generation API |
| MeetingNote | Meeting | Meeting DB/API | Meeting API |
| ReportDraft | Meeting | Meeting DB/API | Report API |
| ActionItem | Meeting | Meeting DB/API until converted | Conversion API |
| ReviewSession | Review | Review DB/API | Review Room API |
| ReviewNode | Review | Review DB/API | Review Room API |
| ReviewDecision | Review | Review DB/API | Review Room API |
| AgentRun | Agent Runtime | Agent DB/API | Agent run API |
| AgentAction | Agent Runtime | Agent DB/API | Approval API |
| Notification | Notification/Common | Notification DB/API | Notification API |
| CanvasBoard | Canvas | Canvas DB/API | Canvas API |
| CanvasNode | Canvas | Canvas DB/API for position/reference only | Canvas API |
| CanvasEdge | Canvas | Canvas DB/API | Canvas API |

## Domain Boundaries

### Auth

Owns:

- User identity.
- OAuth provider account mapping.
- Auth session.
- Login/logout/current user.

Does not own:

- Workspace role.
- GitHub Repository permission.
- Project member profile.

Allowed consumers:

- All domains may require current user identity through auth guard.
- No domain may read OAuth tokens directly.

Boundary rule:

```md
GitHub login does not imply GitHub Repository access.
GitHub Repository access belongs to GitHub Integration.
```

### Workspace

Owns:

- Workspace.
- WorkspaceMember.
- WorkspaceInvite.
- Membership guard.

Does not own:

- Task, Meeting, GitHub, Review, Canvas content.
- Dashboard source data.

Allowed consumers:

- Every Workspace-scoped API must call membership guard.
- Other domains may use Workspace summary and member list.

Boundary rule:

```md
If a user is not a Workspace member, the request must fail.
Do not silently switch to another Workspace.
```

### Task

Owns:

- Task.
- Task status.
- Task assignee.
- Task due date.
- Task type.
- Acceptance criteria.
- TaskDraft approval result.
- Links from Task to GitHub Issue/PR by ID.

Does not own:

- GitHub Issue state.
- GitHub PR state.
- Meeting Report content.
- Review result content.

Allowed consumers:

- Meeting may request Action Item to Task conversion.
- Agent may create TaskDraft through Task owner API.
- GitHub may display linked Task summary.
- Review may display linked Task summary.
- Dashboard may read Task summary.
- Canvas may create reference nodes to Task.

Boundary rule:

```md
GitHub Issue closed does not automatically set Task to done.
Task owner may create a suggested status change, but user confirmation is required.
```

### GitHub Integration

Owns:

- GitHub connection status.
- Repository connection.
- Repository metadata.
- Issue metadata.
- Pull Request metadata.
- Manual sync state.
- Broken reference state.

Does not own:

- Auth login session.
- PILO Task status.
- Review analysis result.
- GitHub merge.

Allowed consumers:

- Task may request issue creation/linking through GitHub API.
- Review may request PR detail and changed files.
- Dashboard may read issue/PR summaries.
- Canvas may reference Issue/PR metadata.
- Agent may ask for GitHub summaries through public API.

Boundary rule:

```md
PILO stores GitHub metadata and links.
GitHub remains the source of truth for Issue/PR original content and merge state.
```

Token rule:

```md
GitHub access tokens must be encrypted if stored.
Tokens must not be logged, sent to Agent prompts, or returned to frontend.
Tokens are not hashed because GitHub API calls require reusable credentials.
```

### Meeting / Voice / Report

Owns:

- MeetingSession.
- VoiceSession.
- TranscriptSegment.
- Text meeting notes.
- ReportDraft.
- Confirmed Report.
- ActionItem.
- Conversion status from ActionItem to Task.

Does not own:

- Task final data after conversion.
- GitHub Issue creation.
- Long-term raw audio file storage.
- Voice command or call-word automation.
- Advanced speaker diarization.

Allowed consumers:

- Task may receive approved Action Item conversion requests.
- Agent may generate ReportDraft from explicit transcript, note, and meeting context.
- Dashboard may read recent Report summary.
- Canvas may reference Report nodes.

Boundary rule:

```md
Meeting creates ActionItem candidates.
Task creates real Tasks.
Voice/STT creates transcript evidence for ReportDraft, not automatic Task changes.
```

### Code Review Room

Owns:

- ReviewSession.
- PR analysis result.
- Review graph.
- ReviewNode.
- ReviewDecision.
- Merge checklist.

Does not own:

- GitHub PR original state.
- GitHub review comments.
- GitHub approvals.
- GitHub merge.
- Task status.

Allowed consumers:

- GitHub provides PR metadata and changed files.
- Task provides linked Task summary.
- Agent may generate PR summary, node explanation, review questions.
- Dashboard may read review status summary.
- Notification may alert review requests.

Boundary rule:

```md
Review decisions are internal PILO learning/review state.
They do not write GitHub comments or approvals in MVP.
```

### Agent Runtime / Planning

Owns:

- AgentRun.
- AgentAction.
- Approval state.
- Project start workflow state.
- ProjectBrief.
- AI output trace metadata.

Does not own:

- Task, GitHub, Meeting, Review, Canvas 원본 데이터.
- Workspace membership.
- Auth session.

Allowed consumers:

- Any domain may request an AgentRun with explicit context.
- Agent may return structured candidates/drafts.
- Domain owner APIs execute approved changes.

Boundary rule:

```md
Agent suggests.
User approves.
Owner domain executes.
```

MVP Agent context sources:

- Current screen.
- Selected object IDs.
- Explicit owner API reads.
- Existing relationship IDs.
- User's current prompt.

MVP Agent forbidden context sources:

- RAG/embedding index.
- Raw GitHub token.
- Data from Workspaces where user is not a member.
- Deleted or archived data unless explicitly requested and permitted.

### Canvas

Owns:

- CanvasBoard.
- CanvasNode position/size/reference metadata.
- CanvasEdge.
- Canvas view settings.

Does not own:

- Task, Report, Issue, PR 원본 데이터.
- File storage.
- Code reference source.

Allowed consumers:

- Dashboard may show recent boards.
- Meeting may link a meeting to a board.
- Agent may suggest Canvas changes as approval actions if Canvas is enabled.

Boundary rule:

```md
Deleting a Canvas node never deletes the original Task, Report, Issue, or PR.
```

### Dashboard

Owns:

- No source data in MVP.
- Optional read model cache only if explicitly defined later.

Reads:

- Workspace summary.
- Task summary.
- GitHub issue/PR summary.
- Report summary.
- Review summary.
- Notification summary.

Boundary rule:

```md
Dashboard is read-only aggregation.
Dashboard must not become a hidden owner of domain state.
```

### Notification

Owns:

- Notification record.
- Read/unread state.
- Related object pointer.

Does not own:

- The related object.
- Agent approval execution.

Boundary rule:

```md
Notification click navigates to owner domain.
Notification does not execute the action by itself.
```

## Cross-Domain Workflows

### Project Start To Task

1. Agent Runtime creates ProjectBrief and TaskDraft/AgentAction list.
2. User reviews candidates.
3. User approves selected candidates.
4. Task API creates real Tasks.
5. AgentRun stores approval result.

Ownership:

- Agent owns draft/candidate reasoning.
- Task owns created Task.

### Task To GitHub Issue

1. User opens Task.
2. User requests Issue creation or existing Issue link.
3. GitHub API prepares preview.
4. User confirms.
5. GitHub Integration creates/links Issue.
6. Task stores link metadata or reads it through GitHub read model.

Ownership:

- Task owns Task.
- GitHub owns Issue metadata and GitHub API side effect.

### GitHub PR To Review Room

1. GitHub Integration syncs PR metadata and changed files.
2. User opens PR in Code Review Room.
3. Review domain creates ReviewSession.
4. Agent generates summary/graph/questions/checklist from explicit PR context.
5. User stores internal ReviewDecision.
6. Merge, comments, approval remain in GitHub.

Ownership:

- GitHub owns PR metadata.
- Review owns analysis and internal decisions.

### Meeting Action Item To Task

1. Meeting domain creates ReportDraft and ActionItem candidates.
2. User edits and approves ActionItem conversion.
3. Task API creates real Task.
4. Meeting stores conversion link.

Ownership:

- Meeting owns ActionItem source.
- Task owns created Task.

### Canvas Reference Node

1. User selects original object from Task/Report/GitHub/Review.
2. Canvas creates reference node with object type and object ID.
3. Canvas displays summary by owner read API.
4. Deleting the Canvas node removes only the reference.

Ownership:

- Canvas owns layout/reference.
- Owner domain owns original data.

### Notification To Owner Screen

1. Owner domain emits or requests notification.
2. Notification stores title/body/type/related object pointer.
3. User clicks notification.
4. Frontend navigates to owner domain screen.

Ownership:

- Notification owns read state.
- Owner domain owns related object and action.

## Permission Rules

### Role Definitions

| Role | MVP meaning |
| --- | --- |
| Owner | Workspace creator or invited owner. Can manage Workspace integration and invites. |
| Member | Normal collaborator. Can use Task, Meeting, Review, Agent, Basic Canvas. |

`Viewer` is excluded from MVP.

### Minimum Permission Matrix

| Action | Owner | Member |
| --- | --- | --- |
| Workspace create | yes | yes |
| Workspace summary read | yes | yes |
| Invite link create | yes | no |
| Invite accept | yes | yes |
| Member list read | yes | yes |
| Workspace edit/delete | excluded | excluded |
| Repository connect/change | yes | no |
| Repository/Issue/PR read | yes | yes |
| GitHub manual sync | yes | yes |
| Task CRUD | yes | yes |
| Meeting/Voice/Report CRUD | yes | yes |
| Review Room use | yes | yes |
| Agent command chat | yes | yes |
| Basic Canvas edit | yes | yes |
| Notification read | own only | own only |

### Error Rules

| Case | Response |
| --- | --- |
| Not logged in | 401 |
| Logged in but not Workspace member | 403 |
| Workspace not found | 404 |
| Object exists but outside accessible Workspace | 404 or 403, choose one per API and keep consistent |
| Owner-only action by Member | 403 |
| GitHub token expired | 409 with reconnect action |
| GitHub permission missing | 403 with permission recovery message |

## Data Change Approval Rules

Agent must request user approval before these actions:

- Task create/update/delete/status change.
- GitHub Issue create/link/unlink.
- Report confirm.
- Action Item to Task conversion.
- Canvas node/edge creation if Canvas is enabled.
- Notification sent to another user.
- Any external API call that changes data.

Agent may run without approval:

- Natural language explanation.
- Summary generation.
- Candidate/draft generation.
- Checklist generation.
- Error explanation.
- Preview generation.

## Implementation Guardrails For AI Agents

Every implementation prompt should include:

```md
Allowed files:
- owner domain paths only

Forbidden:
- other domain repositories/services
- shared DB schema unless this is a contract PR
- docs/contracts unless this is a contract PR
- RAG/embedding implementation

Use:
- owner public API/read model for cross-domain reads
- owner write API for cross-domain changes
- AgentAction approval flow for AI-generated changes
```

## Boundary Change Process

If a feature needs to cross a boundary:

1. Open a `contract` PR first.
2. Update `docs/domain-boundary-v1.md` and `docs/api-contract-v1.md`.
3. Name affected owner and consumer domains.
4. Add fixture/schema changes if needed.
5. Merge contract PR before implementation PR.

No implementation PR may redefine ownership silently.
