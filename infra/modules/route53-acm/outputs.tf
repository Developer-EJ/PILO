output "cloudfront_certificate_arn" {
  value = try(aws_acm_certificate_validation.cloudfront[0].certificate_arn, "")
}

output "alb_certificate_arn" {
  value = try(aws_acm_certificate_validation.alb[0].certificate_arn, "")
}
