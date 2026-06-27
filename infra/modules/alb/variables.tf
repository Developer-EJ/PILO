variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "alb_security_group_id" {
  type = string
}

variable "app_server_port" {
  type = number
}

variable "realtime_server_port" {
  type = number
}

variable "api_certificate_arn" {
  type    = string
  default = ""
}

variable "create_https_listener" {
  type    = bool
  default = false
}
