variable "environment" {
  type    = string
  default = "production"
}

variable "base_domain" {
  type        = string
  description = "Delegated DNS domain for production."
}
