output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

output "frontend_bucket_arn" {
  value = aws_s3_bucket.frontend.arn
}

output "frontend_bucket_regional_domain_name" {
  value = aws_s3_bucket.frontend.bucket_regional_domain_name
}

output "uploads_bucket_name" {
  value = aws_s3_bucket.uploads.bucket
}

output "uploads_bucket_arn" {
  value = aws_s3_bucket.uploads.arn
}
