# PILO Final DB Schema By Feature Owner

이 문서는 최종 하이브리드 스키마인 `docs/db/pilo_erd_schema.sql`을 기준으로 각 담당자가 계속 참고할 수 있게 기능별 테이블, 핵심 필드, 관계를 정리한 문서다.

## 최종 채택 기준

- 팀원이 작성한 `pilo-core-schema.sql`을 Core/MVP 베이스로 채택한다.
- `workspace_members` 중심의 협업 모델을 사용한다. Task 담당자, 회의 참석자, 리뷰어, Agent 실행자는 가능한 한 `users`가 아니라 `workspace_members`를 참조한다.
- Auth는 동현이 소유하며 Google/GitHub OAuth만 MVP 범위로 둔다. Password login은 제외한다.
- Canvas는 문서 기준인 `CanvasBoard / CanvasShape / CanvasConnection`으로 통일한다.
- Code Review는 팀원안의 `pull_request_analyses`를 유지하되, 우리 기획의 `review_graphs / review_nodes / node_review_states`를 추가한다.
- Common/System 테이블인 `notifications`, `shared_files`, `audit_logs`를 포함한다.
- Planning은 팀원안의 plan draft 구조를 유지하고, 우리 기획의 `team_profiles`, `role_assignments`를 추가한다.

## 검증 기준

- 다른 담당자 원본 데이터를 직접 수정하지 않는다.
- 다른 도메인 데이터가 필요하면 API, event, read model, public contract로 연동한다.
- `canvas_shapes.entity_type/entity_id`, `notifications.linked_entity_type/linked_entity_id`, `shared_files.linked_entity_type/linked_entity_id`는 다형 참조라 DB FK를 직접 걸지 않는다. API와 contract 테스트에서 검증한다.
- 실제 서비스 권한 판단은 `workspace_members`를 기준으로 한다.

---

## 동현 - Auth / Workspace

### 기능

Google/GitHub 로그인, 사용자 세션, Workspace 생성/조회/수정, 팀원 초대, 대시보드 개인 설정을 담당한다.

| 테이블 | 핵심 필드 | 관계 |
|---|---|---|
| `users` | `email`, `name`, `avatar_url`, `global_role`, `email_verified_at`, `last_login_at`, `deleted_at` | 사용자 루트. `workspace_members.user_id`, `oauth_accounts.user_id`, `auth_sessions.user_id`가 참조 |
| `oauth_accounts` | `user_id`, `provider`, `provider_user_id`, `provider_email`, `scopes`, `access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at` | `users 1:N oauth_accounts`. Google/GitHub 로그인 계정 |
| `auth_sessions` | `user_id`, `refresh_token_hash`, `user_agent`, `ip_address`, `expires_at`, `revoked_at` | `users 1:N auth_sessions`. 로그인 세션 |
| `workspaces` | `name`, `description`, `type`, `status`, `start_date`, `end_date`, `created_by_user_id`, `deleted_at` | 프로젝트 공간. 대부분의 도메인 테이블이 `workspace_id`로 참조 |
| `workspace_members` | `workspace_id`, `user_id`, `role`, `display_name`, `joined_at` | `workspaces N:M users`. 서비스 내 권한/담당자 기준 |
| `workspace_invites` | `workspace_id`, `email`, `role`, `token_hash`, `invited_by_member_id`, `accepted_by_member_id`, `expires_at`, `accepted_at`, `revoked_at` | 팀원 초대. 초대자/수락자는 `workspace_members` 참조 |
| `dashboard_preferences` | `workspace_id`, `member_id`, `layout`, `hidden_sections` | 사용자별 Dashboard 표시 설정 |

### 경계

- GitHub 로그인은 인증 수단이다.
- GitHub Repository 연결, Issue/PR 조회, Webhook, GitHub App 설치는 주형의 GitHub 도메인이다.

---

## 동현 - Canvas

### 기능

Miro/FigJam처럼 넓은 보드에서 프로젝트 객체를 카드로 배치하고 관계를 시각화한다. Canvas는 실제 업무 데이터를 소유하지 않고 배치, 보기, 필터 설정만 소유한다.

| 테이블 | 핵심 필드 | 관계 |
|---|---|---|
| `canvas_boards` | `workspace_id`, `title`, `board_type`, `created_by_member_id` | `workspaces 1:N canvas_boards` |
| `canvas_shapes` | `canvas_board_id`, `shape_type`, `entity_type`, `entity_id`, `display_title`, `width`, `height`, `color`, `is_collapsed`, `z_index`, `created_by_member_id` | `canvas_boards 1:N canvas_shapes`. 실제 데이터는 `entity_type/entity_id`로 참조 |
| `canvas_connections` | `canvas_board_id`, `source_shape_id`, `target_shape_id`, `connection_type`, `label` | 같은 보드 안의 `canvas_shapes -> canvas_shapes` 연결 |
| `canvas_node_positions` | `canvas_shape_id`, `x`, `y` | `canvas_shapes 1:1 canvas_node_positions`. 카드 위치 저장 |
| `canvas_view_settings` | `canvas_board_id`, `member_id`, `zoom`, `viewport_x`, `viewport_y` | 멤버별 Canvas viewport 저장 |
| `canvas_filter_settings` | `canvas_board_id`, `member_id`, `enabled_entity_types`, `assignee_member_id`, `show_delayed_only`, `show_risk_only`, `filters` | 멤버별 Canvas 필터 저장 |

### Canvas entity 연결

| `entity_type` | 실제 owner | 실제 데이터 |
|---|---|---|
| `task` | 주형 | `tasks.id` |
| `meeting_report` | 진호 | `meeting_reports.id` |
| `pull_request` | 주형/은재 | PR 원본은 `pull_requests.id`, 분석은 `pull_request_analyses.id` |
| `github_issue` | 주형 | `github_issues.id` |
| `document`, `file`, `code` | DevOps/공통 Backend, 표시 owner는 동현 | `shared_files.id` 또는 코드 파일 read model |
| `decision` | 진호 | `meeting_decisions.id` |
| `risk` | 진호/은재/세인 | `meeting_report_risks.id`, `review_risks.id`, `plan_risk_notes.id` 중 contract로 결정 |

---

## 주형 - Task / GitHub / Progress

### 기능

Task CRUD, 체크리스트, 댓글/활동 로그, 의존성, Milestone, GitHub Repository/Issue/PR 동기화, 진행률 계산을 담당한다.

| 테이블 | 핵심 필드 | 관계 |
|---|---|---|
| `milestones` | `workspace_id`, `title`, `start_date`, `end_date`, `status` | `workspaces 1:N milestones`, `tasks.milestone_id`가 참조 |
| `tasks` | `workspace_id`, `milestone_id`, `title`, `description`, `assignee_member_id`, `status`, `priority`, `due_date`, `created_by_member_id`, `deleted_at` | Task 핵심. `workspace_members`로 담당자/작성자 연결 |
| `task_checklist_items` | `task_id`, `title`, `status`, `sort_order` | `tasks 1:N task_checklist_items` |
| `task_comments` | `task_id`, `author_member_id`, `body` | `tasks 1:N task_comments` |
| `task_activity_logs` | `task_id`, `actor_member_id`, `action`, `before_value`, `after_value` | Task 변경 이력 |
| `task_dependencies` | `task_id`, `depends_on_task_id` | Task 간 의존성 |
| `github_connections` | `workspace_id`, `provider`, `installation_id`, `github_account_login`, `scopes`, `state_nonce`, `connected_by_member_id`, `connected_at`, `revoked_at` | Workspace의 GitHub 연결 권한 |
| `github_repositories` | `workspace_id`, `github_connection_id`, `owner`, `repo_name`, `url`, `installation_id`, `default_branch` | 연결된 저장소 |
| `github_issues` | `repository_id`, `number`, `title`, `state`, `url`, `synced_at` | GitHub Issue 원본 |
| `github_issue_labels` | `issue_id`, `name` | Issue label |
| `task_github_issues` | `task_id`, `issue_id` | Task와 GitHub Issue 연결 |
| `pull_requests` | `repository_id`, `number`, `title`, `author_login`, `state`, `branch`, `base_branch`, `url`, `changed_files_count`, `additions`, `deletions`, `opened_at`, `merged_at`, `closed_at`, `synced_at` | GitHub PR 원본 |
| `task_pull_requests` | `task_id`, `pull_request_id` | Task와 PR 연결 |
| `progress_snapshots` | `workspace_id`, `milestone_id`, `total_tasks`, `done_tasks`, `blocked_tasks`, `review_tasks`, `delayed_tasks`, `progress_rate`, `captured_at` | Dashboard용 진행률 스냅샷 |

### 외부 제공

- 동현에게 Task/Progress/GitHub Issue/PR 요약 제공
- 진호의 Action Item을 Task 후보 또는 Task로 전환하는 API 제공
- 은재에게 PR 원본과 Task-PR 연결 정보 제공
- 세인에게 Task 생성/수정 Agent Action contract 제공

---

## 진호 - Meeting / Voice / Report

### 기능

회의, 참석자, 아젠다, 메모, 음성방, transcript, 회의록, 질문/리스크/다음 아젠다, 결정사항, Action Item을 담당한다.

| 테이블 | 핵심 필드 | 관계 |
|---|---|---|
| `meetings` | `workspace_id`, `canvas_board_id`, `title`, `purpose`, `status`, `started_at`, `ended_at`, `created_by_member_id` | 회의 세션 |
| `meeting_participants` | `meeting_id`, `member_id`, `role`, `joined_at`, `left_at` | 회의 참석자 |
| `meeting_agendas` | `meeting_id`, `title`, `status`, `sort_order` | 회의 아젠다 |
| `meeting_memos` | `meeting_id`, `author_member_id`, `body` | 회의 중 수동 메모 |
| `voice_rooms` | `workspace_id`, `meeting_id`, `livekit_room_name`, `status` | 음성방 |
| `voice_sessions` | `voice_room_id`, `meeting_id`, `recording_status`, `started_at`, `ended_at` | 음성 세션/녹음 상태 |
| `transcript_segments` | `meeting_id`, `speaker_member_id`, `source`, `body`, `started_at`, `ended_at` | text/STT transcript 통합 저장 |
| `meeting_reports` | `meeting_id`, `summary`, `created_by_member_id` | 회의록 본문 |
| `meeting_report_open_questions` | `report_id`, `question`, `sort_order` | 회의록 미해결 질문 |
| `meeting_report_risks` | `report_id`, `content`, `severity`, `sort_order` | 회의록 리스크 |
| `meeting_report_next_agendas` | `report_id`, `title`, `sort_order` | 다음 회의 아젠다 후보 |
| `meeting_decisions` | `report_id`, `content`, `status`, `linked_task_id` | 결정사항. 필요 시 B의 Task 참조 |
| `meeting_action_items` | `report_id`, `title`, `description`, `assignee_suggestion_member_id`, `due_date_suggestion`, `status`, `converted_task_id` | Task 후보. 승인 후 주형 Task로 연결 |

### 외부 제공

- 동현에게 최근 회의록, 결정사항, Meeting node read model 제공
- 주형에게 Task 후보 생성을 요청
- 세인의 Agent Runtime으로 회의록 요약/Action Item 추출 workflow 실행

---

## 은재 - Code Review Room / PR Analysis

### 기능

PR 리뷰룸, PR 분석 결과, 변경 파일/함수, 리뷰 그래프/노드, 노드별 리뷰 상태, 질문/리스크/체크리스트를 담당한다.

| 테이블 | 핵심 필드 | 관계 |
|---|---|---|
| `code_review_rooms` | `workspace_id`, `pull_request_id`, `status`, `created_by_member_id` | PR별 리뷰룸 |
| `pull_request_analyses` | `pull_request_id`, `purpose_summary`, `impact_summary`, `test_recommendation`, `risk_level`, `analysis_status`, `ok_count`, `discuss_count`, `risk_count`, `conclusion` | PR 분석 결과 루트 |
| `review_graphs` | `analysis_id`, `summary`, `review_order` | PR 분석 그래프 |
| `changed_files` | `analysis_id`, `file_path`, `change_type`, `additions`, `deletions`, `summary` | 변경 파일 |
| `changed_functions` | `changed_file_id`, `name`, `change_type`, `summary` | 변경 함수/심볼 |
| `review_nodes` | `graph_id`, `changed_file_id`, `changed_function_id`, `node_type`, `label`, `file_path`, `symbol`, `role`, `reason`, `risk_level`, `position` | 리뷰 그래프 노드 |
| `node_review_states` | `node_id`, `reviewer_member_id`, `status`, `comment` | 리뷰어별 노드 판단 |
| `review_comments` | `room_id`, `author_member_id`, `node_id`, `changed_file_id`, `changed_function_id`, `body` | 리뷰 코멘트 |
| `review_questions` | `analysis_id`, `node_id`, `question`, `priority` | Agent가 생성한 리뷰 질문 |
| `review_risks` | `analysis_id`, `node_id`, `type`, `level`, `reason` | 위험 지점 |
| `review_checklist_items` | `analysis_id`, `checklist_type`, `title`, `status`, `checked_by_member_id`, `checked_at`, `sort_order` | 리뷰/머지 체크리스트 통합 |

### 외부 제공

- 동현에게 리뷰 필요 PR 요약, PR Analysis Summary 제공
- 주형에게서 PR 원본과 Task 연결 정보를 받음
- 세인의 Agent Runtime으로 PR 분석 workflow 실행

---

## 세인 - Agent Runtime / Orchestrator / Planning

### 기능

공통 Agent 실행 구조, workflow, trace, action confirmation, 프로젝트 계획 초안, 팀원 프로필, 기술스택 추천, 기능/역할/마일스톤/리스크 초안을 담당한다.

| 테이블 | 핵심 필드 | 관계 |
|---|---|---|
| `agents` | `name`, `domain`, `description`, `enabled` | Agent registry |
| `agent_workflows` | `agent_id`, `type`, `version`, `input_schema`, `output_schema`, `enabled` | Agent 소속 workflow 버전. `type` + `version`은 시스템 전체에서 unique |
| `agent_runs` | `workflow_id`, `workspace_id`, `actor_member_id`, `status`, `input`, `output`, `error`, `started_at`, `finished_at` | Agent 실행 단위 |
| `agent_run_steps` | `run_id`, `step_name`, `status`, `input`, `output`, `error`, `started_at`, `finished_at` | Agent 실행 단계 |
| `agent_contexts` | `run_id`, `context_type`, `ref_id`, `payload` | Agent 입력 맥락 |
| `agent_actions` | `run_id`, `type`, `source`, `requires_confirmation`, `payload`, `status`, `confirmed_by_member_id`, `confirmed_at`, `executed_at` | 승인 필요한 Agent action |
| `agent_traces` | `run_id`, `step_id`, `message`, `metadata` | Agent trace/log |
| `project_plan_drafts` | `workspace_id`, `goal`, `target_user`, `problem`, `duration`, `output_goal`, `status`, `created_by_member_id` | 프로젝트 계획 초안 |
| `team_profiles` | `workspace_member_id`, `experience_tags`, `preferred_role`, `available_time` | 팀원 수준/희망 역할 |
| `plan_tech_stack_recommendations` | `project_plan_draft_id`, `frontend`, `backend`, `database_name`, `ai`, `deploy`, `reason`, `difficulty`, `alternatives` | 기술스택 추천 |
| `plan_feature_drafts` | `project_plan_draft_id`, `title`, `description`, `scope`, `reason`, `sort_order` | 기능 분해 초안 |
| `role_assignments` | `workspace_member_id`, `role_name`, `assigned_by_member_id` | 확정된 역할 배정 |
| `plan_role_assignment_drafts` | `project_plan_draft_id`, `member_id`, `suggested_role`, `reason`, `sort_order` | 역할 배정 초안 |
| `plan_milestone_drafts` | `project_plan_draft_id`, `title`, `start_date`, `end_date`, `sort_order` | 마일스톤 초안 |
| `plan_risk_notes` | `project_plan_draft_id`, `content`, `severity`, `sort_order` | 프로젝트 리스크 초안 |

### 외부 제공

- 동현/주형/진호/은재가 도메인 workflow를 만들 때 공통 실행 규격 제공
- 승인 전 `agent_actions`로 초안을 남기고, 승인 후 각 도메인 API 호출
- A에게 다음 액션 추천, 프로젝트 계획 요약 제공

---

## DevOps / Common System

| 테이블 | 핵심 필드 | 관계 |
|---|---|---|
| `notifications` | `user_id`, `type`, `title`, `linked_entity_type`, `linked_entity_id`, `status`, `read_at` | 사용자 알림. 연결 대상은 다형 참조 |
| `shared_files` | `workspace_id`, `filename`, `file_type`, `url`, `linked_entity_type`, `linked_entity_id`, `uploaded_by_member_id` | Workspace 파일 메타데이터 |
| `audit_logs` | `actor_user_id`, `action`, `target_type`, `target_id`, `before_value`, `after_value` | 중요 조작 이력 |

---

## 핵심 관계 요약

```text
users
  -> oauth_accounts
  -> auth_sessions
  -> workspace_members -> workspaces

workspaces
  -> dashboard_preferences
  -> workspace_invites
  -> milestones -> tasks
  -> github_connections -> github_repositories -> github_issues / pull_requests
  -> canvas_boards -> canvas_shapes -> canvas_node_positions
                    -> canvas_connections
                    -> canvas_view_settings
                    -> canvas_filter_settings
  -> meetings -> meeting_reports
  -> project_plan_drafts

tasks
  -> task_checklist_items
  -> task_comments
  -> task_activity_logs
  -> task_dependencies
  -> task_github_issues -> github_issues
  -> task_pull_requests -> pull_requests

pull_requests
  -> code_review_rooms
  -> pull_request_analyses -> review_graphs -> review_nodes -> node_review_states
                           -> changed_files -> changed_functions
                           -> review_questions
                           -> review_risks
                           -> review_checklist_items

meetings
  -> meeting_participants
  -> meeting_agendas
  -> meeting_memos
  -> transcript_segments
  -> meeting_reports -> meeting_decisions
                     -> meeting_action_items
                     -> meeting_report_open_questions
                     -> meeting_report_risks
                     -> meeting_report_next_agendas

agent_runs
  -> agent_run_steps
  -> agent_contexts
  -> agent_actions
  -> agent_traces
```

## 테이블 수

| 구분 | 테이블 수 |
|---|---:|
| 동현 Auth/Workspace | 7 |
| 동현 Canvas | 6 |
| 주형 Task/GitHub/Progress | 14 |
| 진호 Meeting/Voice/Report | 13 |
| 은재 Code Review/PR Analysis | 11 |
| 세인 Agent/Planning | 15 |
| DevOps/Common System | 3 |
| 전체 | 69 |
