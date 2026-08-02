# PILO dev Core Service Critical Alarms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PILO dev의 미감시 핵심 ECS 서비스 네 개에 자동 조치 없는 최소 CloudWatch Alarm 여덟 개를 Terraform으로 생성한다.

**Architecture:** 새 `core-services-observability` 모듈이 ECS 실행 상태 4개, ALB 정상 target 2개, DLQ backlog 2개를 소유한다. 기존 ALB 모듈은 metric dimension에 필요한 ARN suffix만 output으로 노출한다. ALB output 참조만 암시적 의존성으로 사용하고 ECS·SQS에 대한 명시적 `depends_on`은 두지 않아 기존 애플리케이션 drift를 scoped plan에서 격리한다.

**Tech Stack:** Terraform 1.15.8, AWS provider 5.100.0, CloudWatch, ECS Container Insights, Application Load Balancer metrics, SQS metrics, Node.js 24 정적 계약 테스트.

## Global Constraints

- 대상은 PILO AWS dev와 `ap-northeast-2`뿐이다.
- 생성 대상은 `aws_cloudwatch_metric_alarm` 정확히 8개다.
- 기존 ECS, task definition, ALB, target group, SQS queue를 변경·교체·삭제하지 않는다.
- 모든 Alarm은 `actions_enabled = false`이며 `alarm_actions`, `ok_actions`, `insufficient_data_actions`를 선언하지 않는다.
- 자동 재시작, 롤백, 배포, 확장, 복구를 추가하지 않는다.
- `main` 대상 PR이나 prod 변경을 만들지 않는다.
- 실제 apply는 `-target=module.core_services_observability`로 만든 원격 state 저장 plan이 정확히 `8 to add, 0 to change, 0 to destroy`일 때만 허용한다.
- 기존 drift가 포함된 전체 plan은 검토 증거로만 사용하고 apply하지 않는다.
- Alarm 생성 후 안정화 전에는 PILO Incident Investigator에 연결하지 않는다.

---

### Task 1: Alarm 정적 계약을 실패하는 테스트로 고정

**Files:**

- Create: `infra/tests/core-services-observability.test.mjs`

**Interfaces:**

- Consumes: `infra/envs/dev/main.tf`, `infra/modules/alb/outputs.tf`, 새 observability 모듈 파일
- Produces: 정확한 4+2+2 대상, 임계값, action 금지, dev wiring을 검증하는 정적 계약

- [ ] **Step 1: 실패하는 계약 테스트 작성**

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [moduleMain, moduleVariables, albOutputs, devEnvironment] = await Promise.all([
  readFile(new URL("../modules/core-services-observability/main.tf", import.meta.url), "utf8"),
  readFile(new URL("../modules/core-services-observability/variables.tf", import.meta.url), "utf8"),
  readFile(new URL("../modules/alb/outputs.tf", import.meta.url), "utf8"),
  readFile(new URL("../envs/dev/main.tf", import.meta.url), "utf8")
]);

for (const service of ["app-server", "realtime-server", "ai-worker", "workspace-indexer-worker"]) {
  assert.match(moduleMain, new RegExp(`${service}\\s*=\\s*\\{`));
}
for (const dlq of ["ai-jobs-dlq", "workspace-indexing-dlq"]) {
  assert.match(moduleMain, new RegExp(dlq));
}

assert.match(moduleMain, /resource "aws_cloudwatch_metric_alarm" "running_task_count"/);
assert.match(moduleMain, /metric_name\s*=\s*"RunningTaskCount"/);
assert.match(moduleMain, /namespace\s*=\s*"ECS\/ContainerInsights"/);
assert.match(moduleMain, /resource "aws_cloudwatch_metric_alarm" "healthy_host_count"/);
assert.match(moduleMain, /metric_name\s*=\s*"HealthyHostCount"/);
assert.match(moduleMain, /namespace\s*=\s*"AWS\/ApplicationELB"/);
assert.match(moduleMain, /resource "aws_cloudwatch_metric_alarm" "dlq_backlog"/);
assert.match(moduleMain, /metric_name\s*=\s*"ApproximateNumberOfMessagesVisible"/);
assert.match(moduleMain, /namespace\s*=\s*"AWS\/SQS"/);

const runningStart = moduleMain.indexOf('resource "aws_cloudwatch_metric_alarm" "running_task_count"');
const healthyStart = moduleMain.indexOf('resource "aws_cloudwatch_metric_alarm" "healthy_host_count"');
const dlqStart = moduleMain.indexOf('resource "aws_cloudwatch_metric_alarm" "dlq_backlog"');
assert.ok(runningStart >= 0 && healthyStart > runningStart && dlqStart > healthyStart);

const runningAlarm = moduleMain.slice(runningStart, healthyStart);
const healthyAlarm = moduleMain.slice(healthyStart, dlqStart);
const dlqAlarm = moduleMain.slice(dlqStart);

for (const alarm of [runningAlarm, healthyAlarm]) {
  assert.match(alarm, /comparison_operator\s*=\s*"LessThanThreshold"/);
  assert.match(alarm, /evaluation_periods\s*=\s*2/);
  assert.match(alarm, /period\s*=\s*60/);
  assert.match(alarm, /statistic\s*=\s*"Minimum"/);
  assert.match(alarm, /threshold\s*=\s*1/);
  assert.match(alarm, /treat_missing_data\s*=\s*"breaching"/);
}
assert.match(dlqAlarm, /comparison_operator\s*=\s*"GreaterThanOrEqualToThreshold"/);
assert.match(dlqAlarm, /evaluation_periods\s*=\s*1/);
assert.match(dlqAlarm, /period\s*=\s*60/);
assert.match(dlqAlarm, /statistic\s*=\s*"Maximum"/);
assert.match(dlqAlarm, /threshold\s*=\s*1/);
assert.match(dlqAlarm, /treat_missing_data\s*=\s*"notBreaching"/);
assert.equal((moduleMain.match(/actions_enabled\s*=\s*false/g) ?? []).length, 3);
assert.doesNotMatch(moduleMain, /(?:alarm_actions|ok_actions|insufficient_data_actions)\s*=/);

for (const variable of [
  "name_prefix",
  "load_balancer_arn_suffix",
  "app_target_group_arn_suffix",
  "realtime_target_group_arn_suffix"
]) {
  assert.match(moduleVariables, new RegExp(`variable "${variable}"`));
}
for (const output of [
  "alb_arn_suffix",
  "app_target_group_arn_suffix",
  "realtime_target_group_arn_suffix"
]) {
  assert.match(albOutputs, new RegExp(`output "${output}"`));
}
assert.match(albOutputs, /output "alb_arn_suffix"[\s\S]*?aws_lb\.this\.arn_suffix/);
assert.match(albOutputs, /output "app_target_group_arn_suffix"[\s\S]*?aws_lb_target_group\.app\.arn_suffix/);
assert.match(albOutputs, /output "realtime_target_group_arn_suffix"[\s\S]*?aws_lb_target_group\.realtime\.arn_suffix/);
assert.match(devEnvironment, /module "core_services_observability"/);
assert.match(devEnvironment, /source\s*=\s*"\.\.\/\.\.\/modules\/core-services-observability"/);
const moduleStart = devEnvironment.indexOf('module "core_services_observability"');
const moduleEnd = devEnvironment.indexOf("\nmoved {", moduleStart);
assert.ok(moduleStart >= 0 && moduleEnd > moduleStart);
const devModule = devEnvironment.slice(moduleStart, moduleEnd);
assert.doesNotMatch(devModule, /depends_on\s*=/);
assert.match(devEnvironment, /load_balancer_arn_suffix\s*=\s*module\.alb\.alb_arn_suffix/);
assert.match(devEnvironment, /app_target_group_arn_suffix\s*=\s*module\.alb\.app_target_group_arn_suffix/);
assert.match(devEnvironment, /realtime_target_group_arn_suffix\s*=\s*module\.alb\.realtime_target_group_arn_suffix/);

console.log("Core service observability infrastructure contract verified.");
```

- [ ] **Step 2: RED 확인**

Run: `node --test infra/tests/core-services-observability.test.mjs`

Expected: `ENOENT`로 실패한다. 새 모듈 파일이 아직 없기 때문에 실패해야 한다.

- [ ] **Step 3: 실패 테스트 커밋**

```bash
git add infra/tests/core-services-observability.test.mjs
git commit -m "test: 핵심 서비스 Alarm 계약을 정의한다 (#1811)"
```

### Task 2: 최소 Alarm 모듈과 dev 연결 구현

**Files:**

- Create: `infra/modules/core-services-observability/main.tf`
- Create: `infra/modules/core-services-observability/variables.tf`
- Modify: `infra/modules/alb/outputs.tf`
- Modify: `infra/envs/dev/main.tf`

**Interfaces:**

- Consumes: `name_prefix`, ALB ARN suffix 1개, target group ARN suffix 2개
- Produces: `running_task_count` 4 instances, `healthy_host_count` 2 instances, `dlq_backlog` 2 instances

- [ ] **Step 1: ALB ARN suffix output 추가**

```hcl
output "alb_arn_suffix" {
  value = aws_lb.this.arn_suffix
}

output "app_target_group_arn_suffix" {
  value = aws_lb_target_group.app.arn_suffix
}

output "realtime_target_group_arn_suffix" {
  value = aws_lb_target_group.realtime.arn_suffix
}
```

- [ ] **Step 2: 모듈 입력 계약 작성**

```hcl
variable "name_prefix" {
  type = string
}

variable "load_balancer_arn_suffix" {
  type = string
}

variable "app_target_group_arn_suffix" {
  type = string
}

variable "realtime_target_group_arn_suffix" {
  type = string
}
```

- [ ] **Step 3: 세 종류의 수동 대응형 Alarm 구현**

`main.tf`의 local map은 다음 exact key를 사용한다.

```hcl
running_task_services = {
  app-server               = {}
  realtime-server          = {}
  ai-worker                = {}
  workspace-indexer-worker = {}
}

healthy_host_targets = {
  app-server = {
    target_group_arn_suffix = var.app_target_group_arn_suffix
  }
  realtime-server = {
    target_group_arn_suffix = var.realtime_target_group_arn_suffix
  }
}

dlq_targets = {
  ai-worker = {
    alarm_suffix = "ai-jobs-dlq-backlog"
    queue_name   = "${var.name_prefix}-ai-jobs-dlq"
  }
  workspace-indexer-worker = {
    alarm_suffix = "workspace-indexing-dlq-backlog"
    queue_name   = "${var.name_prefix}-workspace-indexing-dlq"
  }
}
```

위 local과 함께 다음 resource를 작성한다.

```hcl
resource "aws_cloudwatch_metric_alarm" "running_task_count" {
  for_each = local.running_task_services

  alarm_name          = "${var.name_prefix}-${each.key}-running-tasks"
  alarm_description   = "${each.key} has fewer than one running task for two minutes."
  actions_enabled     = false
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Minimum"
  threshold           = 1
  treat_missing_data  = "breaching"

  dimensions = {
    ClusterName = "${var.name_prefix}-cluster"
    ServiceName = "${var.name_prefix}-${each.key}"
  }
}

resource "aws_cloudwatch_metric_alarm" "healthy_host_count" {
  for_each = local.healthy_host_targets

  alarm_name          = "${var.name_prefix}-${each.key}-healthy-targets"
  alarm_description   = "${each.key} has fewer than one healthy ALB target for two minutes."
  actions_enabled     = false
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Minimum"
  threshold           = 1
  treat_missing_data  = "breaching"

  dimensions = {
    LoadBalancer = var.load_balancer_arn_suffix
    TargetGroup  = each.value.target_group_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "dlq_backlog" {
  for_each = local.dlq_targets

  alarm_name          = "${var.name_prefix}-${each.value.alarm_suffix}"
  alarm_description   = "${each.key} DLQ has at least one visible message."
  actions_enabled     = false
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = each.value.queue_name
  }
}
```

action list 속성은 추가하지 않는다.

- [ ] **Step 4: dev root module 연결**

```hcl
module "core_services_observability" {
  source = "../../modules/core-services-observability"

  name_prefix                      = local.name_prefix
  load_balancer_arn_suffix         = module.alb.alb_arn_suffix
  app_target_group_arn_suffix      = module.alb.app_target_group_arn_suffix
  realtime_target_group_arn_suffix = module.alb.realtime_target_group_arn_suffix
}
```

`terraform fmt` 결과에 따라 정렬 공백만 조정한다.

- [ ] **Step 5: GREEN 확인**

Run: `node --test infra/tests/core-services-observability.test.mjs`

Expected: 1 test, 0 failures.

- [ ] **Step 6: 전체 인프라 정적 회귀 확인**

Run: `node --test "infra/tests/*.test.mjs"`

Expected: 15 tests, 0 failures.

- [ ] **Step 7: Terraform 포맷과 정적 유효성 확인**

```powershell
terraform fmt -recursive
terraform fmt -check -recursive
terraform -chdir=infra/envs/dev init -backend=false
terraform -chdir=infra/envs/dev validate
```

Expected: format check exit 0, `Success! The configuration is valid.`

- [ ] **Step 8: 구현 커밋**

```bash
git add infra/modules/core-services-observability infra/modules/alb/outputs.tf infra/envs/dev/main.tf
git commit -m "feat: dev 핵심 서비스 Alarm을 추가한다 (#1811)"
```

### Task 3: 자체 검토와 dev PR 검증

**Files:**

- Review: `docs/superpowers/specs/2026-08-02-core-service-critical-alarms-design.md`
- Review: `docs/superpowers/plans/2026-08-02-core-service-critical-alarms.md`
- Review: Task 1-2의 모든 변경 파일

**Interfaces:**

- Consumes: 검증된 기능 브랜치
- Produces: `dev` 대상 ready PR, 전체 plan 비교 증거, Alarm 전용 scoped 저장 plan

- [ ] **Step 1: 범위 자체 검토**

Run: `git diff --check origin/dev...HEAD`

Run: `git diff --stat origin/dev...HEAD`

확인 항목:

- Terraform 리소스 선언은 새 module의 `aws_cloudwatch_metric_alarm` 세 block뿐이다.
- action 속성이 없고 `actions_enabled = false`다.
- 계정 ID, credential, token, secret, 실제 장애 데이터가 없다.
- `main` workflow와 prod 환경 변경이 없다.

- [ ] **Step 2: 브랜치 push와 dev PR 생성**

```bash
git push -u origin feat/1811-core-service-alarms
gh pr create --base dev --head feat/1811-core-service-alarms
```

PR 제목: `🚨 feat(infra,observability): dev 핵심 서비스 Alarm 추가`

PR 본문은 `Closes #1811`, 로컬 검증 결과, 배포 영향, 정확한 plan gate를 포함한다.

- [ ] **Step 3: 모든 GitHub 검사 확인**

Run: `gh pr checks --watch`

Expected: 모든 required check가 `pass`.

- [ ] **Step 4: PR 전체 Terraform plan과 직전 dev baseline 비교**

확인된 직전 dev baseline:

```text
Plan: 8 to add, 9 to change, 8 to destroy.
```

Alarm 브랜치 전체 plan:

```text
Plan: 16 to add, 9 to change, 8 to destroy.
```

두 plan의 차이는 아래 신규 Alarm 8개 생성으로 제한되어야 한다.

```text
module.core_services_observability.aws_cloudwatch_metric_alarm.running_task_count["app-server"]
module.core_services_observability.aws_cloudwatch_metric_alarm.running_task_count["realtime-server"]
module.core_services_observability.aws_cloudwatch_metric_alarm.running_task_count["ai-worker"]
module.core_services_observability.aws_cloudwatch_metric_alarm.running_task_count["workspace-indexer-worker"]
module.core_services_observability.aws_cloudwatch_metric_alarm.healthy_host_count["app-server"]
module.core_services_observability.aws_cloudwatch_metric_alarm.healthy_host_count["realtime-server"]
module.core_services_observability.aws_cloudwatch_metric_alarm.dlq_backlog["ai-worker"]
module.core_services_observability.aws_cloudwatch_metric_alarm.dlq_backlog["workspace-indexer-worker"]
```

전체 plan은 기존 ECS·RDS drift를 포함하므로 apply하지 않는다. 브랜치가 기존 change/destroy 수를 늘리거나 위 여덟 주소 외 신규 변경을 더하면 병합하지 않는다.

- [ ] **Step 5: 병합 전 Alarm 전용 scoped 저장 plan 검증**

```powershell
terraform -chdir=infra/envs/dev plan -target=module.core_services_observability -out=core-service-alarms.tfplan
terraform -chdir=infra/envs/dev show -no-color core-service-alarms.tfplan
```

Expected: `8 to add, 0 to change, 0 to destroy`, 모두 위 CloudWatch Alarm 주소.

- [ ] **Step 6: dev 병합**

Run: `gh pr merge --merge --delete-branch`

Expected: PR state `MERGED`, base branch `dev`.

### Task 4: scoped 저장 plan 적용과 Alarm 상태 관찰

**Files:**

- No repository file changes
- Runtime artifact: ignored/local saved plan only

**Interfaces:**

- Consumes: 병합된 최신 `origin/dev`, 기존 dev remote state, 사용자 AWS IAM 세션
- Produces: AWS dev CloudWatch Alarm 8개와 적용·상태 확인 증거

- [ ] **Step 1: AWS identity와 region 확인**

```powershell
aws sts get-caller-identity
aws configure get region
```

Expected: 승인된 PILO 계정이며 region은 `ap-northeast-2`. 다르면 중단한다.

- [ ] **Step 2: 최신 dev의 깨끗한 작업공간에서 remote backend 초기화**

```powershell
terraform -chdir=infra/envs/dev init -reconfigure
```

Expected: 기존 remote state backend 초기화 성공.

- [ ] **Step 3: 저장된 plan 생성**

```powershell
terraform -chdir=infra/envs/dev plan -target=module.core_services_observability -out=core-service-alarms.tfplan
terraform -chdir=infra/envs/dev show -no-color core-service-alarms.tfplan
```

Expected: `8 to add, 0 to change, 0 to destroy`, 모두 새 CloudWatch Alarm 주소.

- [ ] **Step 4: plan 안전 게이트 재확인**

다음 중 하나라도 발견되면 apply하지 않는다.

- add 수가 8이 아님
- change 또는 destroy가 1 이상
- CloudWatch Alarm 외 리소스 변경
- alarm action 또는 자동 복구 설정
- 알 수 없는 state drift, 권한 오류, provider 오류

- [ ] **Step 5: 검증된 저장 plan 적용**

Run: `terraform -chdir=infra/envs/dev apply core-service-alarms.tfplan`

Expected: `Apply complete! Resources: 8 added, 0 changed, 0 destroyed.`

저장 plan 파일 없이 `terraform apply`를 실행하거나 전체 configuration plan을 적용하지 않는다.

- [ ] **Step 6: Alarm 존재와 상태 확인**

```powershell
aws cloudwatch describe-alarms --region ap-northeast-2 --alarm-names pilo-dev-app-server-running-tasks pilo-dev-realtime-server-running-tasks pilo-dev-ai-worker-running-tasks pilo-dev-workspace-indexer-worker-running-tasks pilo-dev-app-server-healthy-targets pilo-dev-realtime-server-healthy-targets pilo-dev-ai-jobs-dlq-backlog pilo-dev-workspace-indexing-dlq-backlog --query "MetricAlarms[].{AlarmName:AlarmName,StateValue:StateValue,ActionsEnabled:ActionsEnabled,MetricName:MetricName,Dimensions:Dimensions}" --output json
```

출력은 여덟 Alarm의 name, state, action 활성화 여부, metric, dimensions만 확인하고 저장소에 기록하지 않는다.

두 평가 주기 이상 관찰한 뒤:

- 정상 metric은 `OK`인지 확인한다.
- 실제 장애 조건이면 `ALARM`을 억지로 `OK`로 바꾸지 않고 원인을 보고한다.
- 장기 `INSUFFICIENT_DATA`면 dimension과 metric 유입을 진단한다.
- Investigator 연결은 별도 작업으로 남긴다.
