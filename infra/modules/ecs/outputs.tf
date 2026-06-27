output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "service_names" {
  value = { for key, service in aws_ecs_service.service : key => service.name }
}

output "task_definition_arns" {
  value = { for key, task_definition in aws_ecs_task_definition.service : key => task_definition.arn }
}
