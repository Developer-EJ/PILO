# PILO dev 핵심 서비스 최소 장애 Alarm 설계

날짜: 2026-08-02

대상: PILO AWS dev, `ap-northeast-2`

관련 Issue: #1811

## 목적

현재 전용 CloudWatch Alarm이 없는 PILO ECS 서비스 네 개에 초기 장애 감지를 위한 수동 대응형 Alarm을 추가한다. 이번 변경은 장애 신호를 만드는 일까지만 담당하며 ECS 재시작, 배포, 확장, 복구 또는 외부 알림 전송을 수행하지 않는다.

기존 ECS, ALB, SQS 리소스는 관찰 대상이다. 이번 Terraform 변경은 해당 리소스를 수정하거나 교체하지 않고 `aws_cloudwatch_metric_alarm` 여덟 개만 새로 소유한다.

## 범위

포함:

- `app-server`, `realtime-server`, `ai-worker`, `workspace-indexer-worker`의 `RunningTaskCount` Alarm 각 1개
- `app-server`, `realtime-server` ALB target group의 `HealthyHostCount` Alarm 각 1개
- `ai-worker`, `workspace-indexer-worker`가 소비하는 작업 큐 DLQ Alarm 각 1개
- 정확히 8개 Alarm의 Terraform 소유권, 정적 계약 테스트, plan 검증
- Alarm 생성 후 상태 안정화 확인

제외:

- CPU, 메모리, 5XX, latency, 일반 queue backlog와 oldest-message Alarm
- SNS, Slack, Lambda 등 `alarm_actions`, `ok_actions`, `insufficient_data_actions`
- 자동 재시작, 롤백, 배포, 확장 또는 복구
- 기존 ECS service, task definition, ALB, target group, SQS queue 설정 변경
- 이 PR에서 PILO Incident Investigator의 EventBridge 대상에 신규 Alarm 연결
- prod 환경

## Alarm 계약

### ECS 실행 상태 4개

대상 서비스:

- `app-server`
- `realtime-server`
- `ai-worker`
- `workspace-indexer-worker`

공통 설정:

- namespace: `ECS/ContainerInsights`
- metric: `RunningTaskCount`
- dimensions: `ClusterName`, `ServiceName`
- statistic: `Minimum`
- period: 60초
- evaluation periods: 2
- comparison: `LessThanThreshold`
- threshold: 1
- missing data: `breaching`
- 의미: 실행 중 task가 2분 연속 0개일 때 `ALARM`

desired count는 현재 2지만 임계값은 1로 둔다. 이번 최소 Alarm은 완전 중단을 감지하며 2개 중 1개만 남은 용량 저하는 후속 관측 범위다.

### ALB 정상 대상 2개

대상 target group:

- `app-server`
- `realtime-server`

공통 설정:

- namespace: `AWS/ApplicationELB`
- metric: `HealthyHostCount`
- dimensions: `LoadBalancer`, `TargetGroup`
- statistic: `Minimum`
- period: 60초
- evaluation periods: 2
- comparison: `LessThanThreshold`
- threshold: 1
- missing data: `breaching`
- 의미: 정상 target이 2분 연속 0개일 때 `ALARM`

CloudWatch dimension에는 전체 ARN이 아니라 AWS가 요구하는 ALB와 target group의 ARN suffix를 사용한다. 기존 ALB 모듈은 이 suffix를 output으로만 노출하며 ALB나 target group 자체를 변경하지 않는다.

### DLQ 2개

대상:

- AI jobs DLQ
- workspace indexing DLQ

공통 설정:

- namespace: `AWS/SQS`
- metric: `ApproximateNumberOfMessagesVisible`
- dimension: `QueueName`
- statistic: `Maximum`
- period: 60초
- evaluation periods: 1
- comparison: `GreaterThanOrEqualToThreshold`
- threshold: 1
- missing data: `notBreaching`
- 의미: DLQ에 보이는 메시지가 1개 이상이면 `ALARM`

## Terraform 구조

새 모듈 `infra/modules/core-services-observability`가 여덟 Alarm을 전부 소유한다.

- `variables.tf`: name prefix와 ALB/target group ARN suffix 입력 계약
- `main.tf`: 세 종류의 Alarm을 각각 `for_each`로 선언
- 서비스명, cluster명, DLQ명은 기존 observability 모듈과 동일하게 `name_prefix`에서 결정적으로 만든다.

`infra/modules/alb/outputs.tf`에는 다음 읽기 전용 output을 추가한다.

- ALB ARN suffix
- App target group ARN suffix
- Realtime target group ARN suffix

`infra/envs/dev/main.tf`은 새 모듈에 suffix를 전달하고 `module.ecs`, `module.sqs`, `module.alb` 뒤에 생성되도록 명시한다. output 추가와 dependency graph 변경은 AWS 리소스 변경을 만들지 않아야 한다.

모든 Alarm은 `actions_enabled = false`로 만들고 action 목록을 선언하지 않는다. Alarm은 상태를 계산하고 CloudWatch 상태 변경 이벤트를 만들 수 있지만, 자체적으로 어떤 복구나 알림 대상도 호출하지 않는다.

## 테스트와 검증

정적 계약 테스트 `infra/tests/core-services-observability.test.mjs`는 다음을 검증한다.

- 대상 서비스 4개, ALB target 2개, DLQ 2개가 정확히 선언됨
- 각 Alarm 종류의 namespace, metric, statistic, period, evaluation periods, threshold, missing-data 정책
- `actions_enabled = false`
- action 속성이 없음
- dev root module이 새 모듈을 호출하고 ALB ARN suffix를 전달함
- ALB output 세 개가 실제 리소스의 `arn_suffix`를 노출함

검증 명령:

- `node --test infra/tests/core-services-observability.test.mjs`
- `node --test "infra/tests/*.test.mjs"`
- `terraform fmt -check -recursive`
- dev root에서 `terraform init -backend=false`와 `terraform validate`
- GitHub PR의 원격 state 기반 Terraform plan

## 배포 안전 게이트

1. 기능 브랜치의 로컬 테스트와 Terraform 검증을 통과시킨다.
2. `dev` 대상 PR을 만들고 모든 GitHub 검사를 통과시킨다.
3. PR plan에서 이 변경의 예상 결과가 CloudWatch Alarm 8개 생성뿐인지 확인한다.
4. 변경, 교체, 삭제 또는 ECS·ALB·SQS 등 범위 밖 리소스 작업이 하나라도 있으면 병합·적용하지 않고 원인을 조사한다.
5. PR을 merge commit으로 `dev`에 병합한다. `main`에는 보내지 않는다.
6. 최신 `dev`와 원격 state로 저장된 Terraform plan을 다시 만든다.
7. 최종 plan이 정확히 `8 to add, 0 to change, 0 to destroy`일 때만 적용한다.
8. 적용 직후 Alarm이 일시적으로 `INSUFFICIENT_DATA`일 수 있으므로 최소 두 평가 주기 이상 상태를 관찰한다.
9. 실제 조건 위반이 아닌데 `ALARM` 또는 장기 `INSUFFICIENT_DATA`가 남으면 Investigator 연결을 보류하고 metric dimension과 데이터 유입을 진단한다.
10. 여덟 Alarm이 정상적으로 평가된 뒤, 별도 저장소·별도 PR에서 Incident Investigator의 EventBridge 대상에 연결한다.

## 실패 처리와 롤백

- Terraform plan 범위 초과: apply하지 않는다.
- 권한 또는 state 접근 실패: 설정을 추측하거나 우회하지 않고 중단한다.
- 생성 직후 예상하지 않은 `ALARM`: 자동 조치를 수행하지 않고 원인을 확인한다.
- 잘못된 dimension 또는 임계값: 콘솔에서 직접 수정하지 않고 Terraform 후속 PR로 고친다.
- 제거가 필요할 때도 콘솔에서 삭제하지 않고 별도 승인된 Terraform plan으로 소유권을 유지한다.

## 완료 기준

- 테스트와 Terraform 검증이 통과한다.
- `dev` PR이 통과하고 병합된다.
- 실제 apply plan은 정확히 8개 생성, 변경 0, 삭제 0이다.
- AWS에 여덟 Alarm이 생성되어 metric을 평가한다.
- 기존 ECS, ALB, target group, SQS 리소스에는 변경이 없다.
- Alarm action과 자동 복구 동작이 없다.
- Incident Investigator 연결은 이 변경에서 수행하지 않는다.
