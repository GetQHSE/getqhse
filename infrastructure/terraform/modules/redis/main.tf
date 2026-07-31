variable "environment" {
  type = string
}

variable "network_id" {
  type    = string
  default = null
}

output "connection_secret_name" {
  value = null
}
