locals {
  app_server_secrets = [
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SECRET",
    "SESSION_SECRET",
    "GITHUB_APP_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_WEBHOOK_SECRET",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "LIVEKIT_URL",
    "OPENAI_API_KEY",
  ]

  realtime_server_secrets = [
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SECRET",
  ]

  ai_worker_secrets = [
    "DATABASE_URL",
    "REDIS_URL",
    "OPENAI_API_KEY",
    "GITHUB_APP_ID",
    "GITHUB_APP_PRIVATE_KEY",
  ]

  all_secret_names = toset(concat(
    [for name in local.app_server_secrets : "app-server/${name}"],
    [for name in local.realtime_server_secrets : "realtime-server/${name}"],
    [for name in local.ai_worker_secrets : "ai-worker/${name}"],
  ))
}

resource "aws_secretsmanager_secret" "this" {
  for_each = local.all_secret_names

  name                    = "${var.name_prefix}/${each.key}"
  recovery_window_in_days = 7
}
