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
assert.match(
  albOutputs,
  /output "realtime_target_group_arn_suffix"[\s\S]*?aws_lb_target_group\.realtime\.arn_suffix/
);
assert.match(devEnvironment, /module "core_services_observability"/);
assert.match(devEnvironment, /source\s*=\s*"\.\.\/\.\.\/modules\/core-services-observability"/);
const moduleStart = devEnvironment.indexOf('module "core_services_observability"');
const moduleEnd = devEnvironment.indexOf("\nmoved {", moduleStart);
assert.ok(moduleStart >= 0 && moduleEnd > moduleStart);
const devModule = devEnvironment.slice(moduleStart, moduleEnd);
assert.doesNotMatch(devModule, /depends_on\s*=/);
assert.match(devEnvironment, /load_balancer_arn_suffix\s*=\s*module\.alb\.alb_arn_suffix/);
assert.match(devEnvironment, /app_target_group_arn_suffix\s*=\s*module\.alb\.app_target_group_arn_suffix/);
assert.match(
  devEnvironment,
  /realtime_target_group_arn_suffix\s*=\s*module\.alb\.realtime_target_group_arn_suffix/
);

console.log("Core service observability infrastructure contract verified.");
