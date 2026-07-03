output "secret_arns" {
  value = [for secret in aws_secretsmanager_secret.this : secret.arn]
}

output "app_server_ecs_secrets" {
  value = {
    for name in local.app_server_secrets :
    name => aws_secretsmanager_secret.this["app-server/${name}"].arn
  }
}

output "realtime_server_ecs_secrets" {
  value = {
    for name in local.realtime_server_secrets :
    name => aws_secretsmanager_secret.this["realtime-server/${name}"].arn
  }
}

output "ai_worker_ecs_secrets" {
  value = {
    for name in local.ai_worker_secrets :
    name => aws_secretsmanager_secret.this["ai-worker/${name}"].arn
  }
}
