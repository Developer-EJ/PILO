# Agent Tool Retrieval dev rollout

## 범위

`AGENT_TOOL_RETRIEVAL_MODE`는 Agent Worker의 ECS task 환경 변수다. dev의 기본값은
`shortlist`이며, 지원하는 값은 아래 두 개뿐이다.

| 값 | planner에 전달하는 tool schema |
| --- | --- |
| `shadow` | 현재 hard-eligible 전체 tool schema |
| `shortlist` | retrieval로 선택한 read/write capability와 필요한 prerequisite chain |

빈 값이나 알 수 없는 값은 Worker에서 `shadow`로 처리한다. remote flag와 Workspace별 allowlist는
이 rollout의 범위가 아니다.

## shortlist 안전 정책

- catalog가 없는 구형 job은 기존 전체-tool 경로로 fallback한다.
- catalog SHA 불일치 또는 eligible schema와 catalog digest 불일치는 planner를 호출하지 않고
  clarification으로 종료한다.
- 낮은 confidence, retriever 오류, schema budget 초과는 기존 전체-tool 경로로 fallback한다.
- shortlist 밖 tool 또는 field를 planner가 반환하면 normalization이 거부한다.
- shortlist 여부와 무관하게 App Server의 input validator, Workspace 권한, confirmation, 멱등성,
  실행 직전 상태·권한 재검증은 실행 권위 경계로 유지된다.
- 최초 사용자 발화 또는 현재 `turnSequence`를 재개한 최신 follow-up 한 건과 bounded thread resource,
  completed tool result, 선택 후보 label/description에서
  고신뢰 prompt injection 신호가 탐지되면 retrieval과 planner를 호출하지 않는다. context repository가
  각 production value를 구조화된 source kind로 전달하며 detector가 display 문자열 prefix를 추측하지 않는다.
  이 경로는 전체-tool fallback으로 권한을 넓히지 않고 clarification으로 종료한다.

Worker step의 `outputSummary.toolRetrieval`에는 mode, fallback reason, catalog/eligible snapshot/
planner tool snapshot SHA만 기록한다. raw 발화, tool input, resource ID, token은 기록하지 않는다.
catalog integrity failure에서도 형식이 유효한 수신 catalog version/SHA는 trace에 남긴다. 형식 자체가
유효하지 않은 값은 trace에 기록하지 않는다.

`outputSummary.promptSecurity`에는 detector version, `clear|blocked`, bounded reason, source kind,
signal taxonomy와 signal 수만 기록한다. 공격 문자열이나 탐지된 원문은 저장하지 않는다. grounded Meeting
answer도 질문 또는 evidence에서 같은 신호를 탐지하면 provider를 호출하지 않고 citation 없는 안전한
응답으로 끝낸다.

## dev 전환과 rollback

1. `infra/envs/dev/main.tf`에서 Agent Worker의 `AGENT_TOOL_RETRIEVAL_MODE` 값을 확인한다. 기본값은
   `shortlist`다.
2. Terraform apply로 새 ECS task definition을 배포하고 Agent Worker service가 stable 상태가 될 때까지
   기다린다.
3. 새 Agent run의 planner step에서 `outputSummary.toolRetrieval.mode`, `usedShortlist`, fallback reason과
   세 SHA 및 `outputSummary.promptSecurity`를 확인한다. raw 요청·UUID·token이 output summary에 없는지도
   확인한다.
4. 문제 발생 시 같은 환경 변수를 `shadow`로 바꾸고 Terraform apply로 Agent Worker task를 rollout한다.
   새 run이 전체 hard-eligible tool schema를 받는지 확인한다.

rollback은 planner tool handoff만 바꾼다. 이미 생성된 confirmation, 실행 중인 run, domain write 결과를
되돌리거나 재실행하지 않는다. catalog integrity failure는 `shadow`로 자동 fallback하지 않으며,
clarification으로 끝난 run을 사용자가 다시 요청해야 한다.

prompt injection 의심 run은 mode와 무관하게 `shadow`로 fallback하지 않는다. 사용자가 외부 지시·보안
우회 문구를 제거하고 작업과 대상만 다시 요청해야 한다. 운영자는 raw 발화를 조회하지 않고
`promptSecurity.reason=prompt_injection_suspected`, `sourceKinds`, `signalTypes`만 확인한다.
재개 run은 과거 user message 전체가 아니라 최신 follow-up만 `user_follow_up`으로 검사하므로 안전하게
고친 후속 요청은 이전 차단 문장 때문에 반복 차단되지 않는다.

## Phase 4-E 자동 readiness gate

App CI는 App Server 전체 Agent/Meeting test가 통과한 뒤 registry snapshot 계약과 Meeting runtime E2E
suite를 검사한다. `meeting-tools`, `execution`, `confirmation` suite가 실제 tool 실행, confirmation 생성·승인,
Workspace 권한, 멱등성, 승인 시점 재검증을 통과해야 runtime evidence가 생성된다.

| 흐름 | terminal tool | 실행 경계 |
| --- | --- | --- |
| 현재 회의 나가기 | `leave_meeting` | current-meeting contextual resolve와 실행 직전 권한·상태 재검증 |
| 녹음 종료 | `end_meeting_recording` | confirmation required |
| action item 수정 | `update_meeting_report_action_item` | confirmation required |
| action item 승인 | `approve_meeting_report_action_item` | confirmation required |

AI Worker의 `check_phase4e_dev_readiness.py`는 이 결과를 retrieval/security gate, Meeting canonical·held-out·
negative·multi-turn의 실제 `shadow`/`shortlist` provider evaluation, dev Terraform과 이 runbook에 결합한다.
fixture 개수만으로는 실행할 수 없으며 네 evaluation report가 registry/catalog SHA와 일치해야 한다. 최종
`phase4e-dev-readiness` artifact가 `passed=true`여야 dev 공개 후보로 판정한다. artifact에는
check ID·count·SHA·정확도·recall만 남고 사용자 발화,
resource ID, UUID, tool input, token은 남지 않는다.

## 실제 ECS smoke와 수동 Meeting 흐름

GitHub Actions에 `DEV_APP_SERVER_URL`, `PHASE4E_DEV_WORKSPACE_ID` repository variable과 테스트 사용자용
`PHASE4E_DEV_AGENT_TOKEN` secret을 설정한다. 전용 Workspace에는 완료된 회의록 한 건과 현재 사용자가
참여 중인 녹음 중 회의를 준비한다.

`Phase 4-E Agent Dev Smoke` workflow를 `expected_mode=shortlist`로 실행한다. workflow는
dev Agent Worker service의 running/desired count, 단일 안정 deployment와 실제 task definition의
`AGENT_TOOL_RETRIEVAL_MODE`를 확인한 뒤 실제 Agent API로 최근 회의록 read run과 녹음 종료 write run을
생성한다. read는 `get_meeting_report` 완료와 retrieval trace를, write는 pending confirmation과 승인 전
mutation 부재를 검사한 뒤 confirmation을 reject해 정리한다. rollback 검증 시에는
Terraform에서 `shadow`로 변경·apply하고 service가 stable해진 뒤 같은 workflow를 `expected_mode=shadow`로
실행한다. smoke workflow 자체는 배포나 mode 변경을 수행하지 않고 실제 write confirmation을 승인하지 않는다.

전용 dev Workspace에서 아래 순서로 사용자 흐름을 확인한다. write는 테스트용 Meeting/resource에서만
수행하고 confirmation 화면에서 대상과 변경값을 확인한 뒤 승인한다.

1. “최근 회의록 보여줘”와 “최근 3건 회의록 보여줘”로 최신순 1/N 조회를 확인한다.
2. 동명이인 회의/회의록 후보를 만든 뒤 버튼 선택 → original goal 재개가 같은 run/thread에서 한 번만
   일어나는지 확인한다.
3. “회의 나가줘”가 현재 참여 중인 회의를 해소하고 퇴장하는지 확인한다.
4. “녹음 끝내줘”가 자동 실행되지 않고 confirmation 뒤 종료·회의록 생성 요청으로 이어지는지 확인한다.
5. action item 수정·승인이 각각 confirmation, Workspace 권한, 멱등성 claim, 실행 직전 resource 재검증을
   거치는지 확인한다. 같은 confirmation 재승인은 중복 mutation을 만들면 안 된다.
6. 만료/stale/다른 thread 후보와 catalog integrity 실패를 넣었을 때 write 없이 clarification으로 끝나는지
   확인한다.
7. planner step의 `toolRetrieval`, `promptSecurity`, selector/fallback taxonomy를 확인하고 raw 발화·UUID·
   token이 없는지 확인한다.

실제 provider 응답 품질은 별도 `Evaluate Agent Planner` workflow에서 dev source, 고정 기준일·timezone·model·
repetition으로 canonical과 held-out을 실행한다. provider 평가 실패를 deterministic gate 결과로 덮어쓰지
않으며, 두 artifact와 수동 smoke 결과를 함께 이슈에 첨부한다.
