locals {
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
}

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
