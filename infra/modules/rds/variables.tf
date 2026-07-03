variable "name_prefix" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_ids" {
  type = list(string)
}

variable "instance_class" {
  type = string
}

variable "allocated_storage" {
  type = number
}

variable "deletion_protection" {
  type = bool
}

variable "database_name" {
  type    = string
  default = "pilo"
}

variable "master_username" {
  type    = string
  default = "pilo_admin"
}
