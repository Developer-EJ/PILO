output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "app_server_security_group_id" {
  value = aws_security_group.app_server.id
}

output "realtime_server_security_group_id" {
  value = aws_security_group.realtime_server.id
}

output "ai_worker_security_group_id" {
  value = aws_security_group.ai_worker.id
}

output "rds_security_group_id" {
  value = aws_security_group.rds.id
}

output "redis_security_group_id" {
  value = aws_security_group.redis.id
}
