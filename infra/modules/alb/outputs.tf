output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "alb_zone_id" {
  value = aws_lb.this.zone_id
}

output "app_target_group_arn" {
  value = aws_lb_target_group.app.arn
}

output "realtime_target_group_arn" {
  value = aws_lb_target_group.realtime.arn
}

output "alb_arn_suffix" {
  value = aws_lb.this.arn_suffix
}

output "app_target_group_arn_suffix" {
  value = aws_lb_target_group.app.arn_suffix
}

output "realtime_target_group_arn_suffix" {
  value = aws_lb_target_group.realtime.arn_suffix
}
