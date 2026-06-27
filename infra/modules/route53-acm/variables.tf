variable "create_dns_records" {
  type    = bool
  default = false
}

variable "hosted_zone_id" {
  type    = string
  default = ""
}

variable "frontend_domain_name" {
  type    = string
  default = ""
}

variable "api_domain_name" {
  type    = string
  default = ""
}
