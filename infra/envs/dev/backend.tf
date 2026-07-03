terraform {
  backend "s3" {
    bucket       = "replace-me-dev-terraform-state"
    key          = "infra/dev/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
