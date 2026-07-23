variable "name_prefix" {
  type = string
}

variable "frontend_bucket_name" {
  type = string
}

variable "frontend_bucket_arn" {
  type = string
}

variable "frontend_bucket_domain_name" {
  type = string
}

variable "aliases" {
  type    = list(string)
  default = []
}

variable "acm_certificate_arn" {
  type    = string
  default = ""
}

variable "canonical_frontend_origin" {
  type    = string
  default = ""
}

variable "legacy_redirect_hostnames" {
  type    = list(string)
  default = []
}

variable "legacy_redirect_status_code" {
  type    = number
  default = 302

  validation {
    condition     = contains([302, 308], var.legacy_redirect_status_code)
    error_message = "legacy_redirect_status_code must be 302 or 308."
  }
}
