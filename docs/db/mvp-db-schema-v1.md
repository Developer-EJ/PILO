# PILO MVP DB Schema v1

이 문서는 현재 `dev`를 다시 시작하기 위한 MVP DB 구현 기준선이다.
DB source of truth는 `docs/db/pilo_erd_schema.sql`이며, 현재 기준선은 70개 table이다.

이전 41개 축소안은 기능 명세만 보고 정리한 target 후보였지만, 현재 active contract와 app-server 구현이 이미
Task draft, Milestone, Canvas shape/view/filter, VoiceRoom, Review graph 세부 table을 사용하므로 그대로 적용하면
기존 구현이 깨진다. 따라서 v1 기준은 "MVP 기능 표면 + 현재 구현/contract가 요구하는 지원 table"로 고정한다.

함께 읽을 문서:

- `docs/mvp-scope-v1.md` - MVP 포함/제외 범위.
- `docs/domain-boundary-v1.md` - 도메인 소유권과 source of truth.
- `docs/api-contract-v1.md` - API request/response 계약.
- `docs/db/db-schema-by-owner.md` - owner별 table 설명.
- `docs/collaboration-v1.md` - DB 변경 PR 규칙.

## 결론

| 항목 | 기준 |
| --- | --- |
| SQL bootstrap | `docs/db/pilo_erd_schema.sql` |
| Local idempotent migrations | `docs/db/migrations/*.sql` |
| Local seed | `docs/db/seeds/001_donghyun_auth_workspace_canvas_seed.sql`, `docs/db/seeds/002_juhyung_github_review_seed.sql` |
| Prisma schema | `apps/app-server/prisma/schema.prisma` |
| 현재 table 수 | 70 |

Prisma는 현재 DB-backed로 구현된 app-server 영역의 subset만 모델링한다.
Prisma에 없는 table이 곧 제외 table이라는 뜻은 아니다.
반대로 Prisma의 `@@map(...)` table은 반드시 `pilo_erd_schema.sql`에 존재해야 하며, 이 조건은 `tests/docs.test.mjs`가 검증한다.

## 포함 Table

### 동현 - Auth / Workspace / Canvas

| Table | 상태 | Notes |
| --- | --- | --- |
| `users` | included | 사용자 root |
| `oauth_accounts` | included | Google/GitHub OAuth 계정 |
| `auth_sessions` | included | refresh token hash 기반 server session |
| `workspaces` | included | 프로젝트 workspace |
| `workspace_members` | included | workspace 권한과 담당자 기준 |
| `workspace_invites` | included | 초대 |
| `dashboard_preferences` | support | Dashboard 개인화 table. MVP API surface는 최소로 제한 |
| `canvas_boards` | included | Canvas board |
| `canvas_shapes` | included | Task/Report/Issue/PR reference card |
| `canvas_connections` | included | Canvas card 연결 |
| `canvas_node_positions` | included | Canvas 위치 |
| `canvas_view_settings` | support | 멤버별 viewport |
| `canvas_filter_settings` | support | 멤버별 filter |

### 주형 - Task / GitHub / Progress

| Table | 상태 | Notes |
| --- | --- | --- |
| `milestones` | included | Task grouping |
| `tasks` | included | Task source of truth |
| `task_drafts` | included | Agent/Meeting이 만든 Task 후보. Prisma `TaskDraft`와 일치 |
| `task_checklist_items` | included | Task checklist |
| `task_comments` | included | Task comment |
| `task_activity_logs` | included | Task 변경 이력 |
| `task_dependencies` | included | Task dependency |
| `github_connections` | included | Workspace GitHub App 연결 |
| `github_repositories` | included | Repository metadata |
| `github_issues` | included | Issue metadata |
| `github_issue_labels` | included | Issue label |
| `task_github_issues` | included | Task-Issue link |
| `pull_requests` | included | PR metadata |
| `task_pull_requests` | included | Task-PR link |
| `progress_snapshots` | included | Dashboard/Progress snapshot |

### 진호 - Meeting / Voice / Report

| Table | 상태 | Notes |
| --- | --- | --- |
| `meetings` | included | Meeting source of truth |
| `meeting_participants` | included | 참석자 |
| `meeting_agendas` | included | agenda |
| `meeting_memos` | included | manual memo |
| `voice_rooms` | included | 현재 Voice contract가 사용하는 room |
| `voice_sessions` | included | voice/STT session |
| `transcript_segments` | included | STT/manual transcript segment |
| `meeting_reports` | included | Report draft/confirmed |
| `meeting_report_open_questions` | included | report open question |
| `meeting_report_risks` | included | report risk |
| `meeting_report_next_agendas` | included | next agenda |
| `meeting_decisions` | included | decision |
| `meeting_action_items` | included | action item -> Task draft |

### 은재 - Code Review / PR Analysis

| Table | 상태 | Notes |
| --- | --- | --- |
| `code_review_rooms` | included | review room |
| `pull_request_analyses` | included | PR analysis run/result |
| `review_graphs` | included | review graph root |
| `changed_files` | included | PR changed file |
| `changed_functions` | included | changed function |
| `review_nodes` | included | graph node |
| `node_review_states` | included | node review state |
| `review_comments` | included | review comment |
| `review_questions` | included | review question |
| `review_risks` | included | review risk |
| `review_checklist_items` | included | review checklist |

### 세인 - Agent Runtime / Planning

| Table | 상태 | Notes |
| --- | --- | --- |
| `agents` | included | agent registry |
| `agent_workflows` | included | workflow registry |
| `agent_runs` | included | agent execution |
| `agent_run_steps` | included | execution step |
| `agent_contexts` | included | run context |
| `agent_actions` | included | user approval/action |
| `agent_traces` | included | debug trace |
| `project_plan_drafts` | included | project planning draft |
| `team_profiles` | included | team profile |
| `plan_tech_stack_recommendations` | included | tech stack candidate |
| `plan_feature_drafts` | included | feature candidate |
| `role_assignments` | included | confirmed role assignment |
| `plan_role_assignment_drafts` | included | role assignment candidate |
| `plan_milestone_drafts` | included | milestone candidate |
| `plan_risk_notes` | included | risk note |

### Common / Support

| Table | 상태 | Notes |
| --- | --- | --- |
| `notifications` | included | 최소 in-app notification |
| `shared_files` | support/deferred | MVP 파일 업로드 API는 만들지 않는다. table은 기존 SQL 호환용 |
| `audit_logs` | support/deferred | 전체 audit log 기능은 MVP API surface가 아니다 |

## 제외 영역

아래 table/기능은 MVP DB 기준선에 넣지 않는다.

- RAG / embedding / vector index.
- 장기 raw audio 보관.
- GitHub Actions log mirror.
- 사용자 간 일반 채팅.
- production-grade audit workflow.
- shared drive UX와 파일 업로드 API.

이미 SQL에 support/deferred로 남아 있는 table은 새 기능 구현 근거가 아니다.
해당 기능을 켜려면 먼저 `spec` 또는 `contract` PR로 MVP 범위를 바꾼다.

## Rebaseline 결정

이번 rebaseline에서 확정한 사항:

1. `task_drafts`는 MVP에 포함한다.
2. `task_drafts`는 `docs/db/pilo_erd_schema.sql`과 `docs/db/migrations/202606300500_mvp_task_drafts_rebaseline.sql`에 존재한다.
3. Docker local bootstrap은 schema, owner migration, task draft rebaseline migration, seed 순서로 실행한다.
4. Prisma model은 현재 DB-backed table subset만 유지한다.
5. 모든 Prisma `@@map` table은 SQL baseline에 있어야 한다.

## DB 변경 규칙

1. DB table/column 변경은 반드시 이 문서, `pilo_erd_schema.sql`, migration, Prisma 영향, test를 함께 확인한다.
2. 한 도메인 PR에서 다른 도메인 table을 직접 바꾸지 않는다.
3. table rename은 금지한다. rename이 필요하면 별도 `contract` PR에서 owner/consumer migration plan을 먼저 합의한다.
4. in-memory/mock 도메인을 DB-backed로 바꿀 때만 해당 table의 Prisma model을 추가한다.
5. seed는 local fixture일 뿐 schema source of truth가 아니다.

## 검증

기준선 변경 후 최소 검증:

```powershell
node --test tests\docs.test.mjs
```

Prisma schema를 변경했다면 추가 검증:

```powershell
npm --prefix apps/app-server run prisma:generate
npm --prefix apps/app-server test
```
