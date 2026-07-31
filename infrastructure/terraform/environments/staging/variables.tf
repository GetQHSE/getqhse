variable "environment" {
  type    = string
  default = "staging"
}

variable "base_domain" {
  type        = string
  description = "Delegated DNS domain for this environment."
}
