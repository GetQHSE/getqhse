module "networking" {
  source      = "../../modules/networking"
  environment = var.environment
}

module "secrets" {
  source      = "../../modules/secrets"
  environment = var.environment
}

module "postgresql" {
  source      = "../../modules/postgresql"
  environment = var.environment
  network_id  = module.networking.network_id
}

module "redis" {
  source      = "../../modules/redis"
  environment = var.environment
  network_id  = module.networking.network_id
}

module "object_storage" {
  source      = "../../modules/object-storage"
  environment = var.environment
}

module "container_runtime" {
  source      = "../../modules/container-runtime"
  environment = var.environment
  network_id  = module.networking.network_id
}

module "container_registry" {
  source      = "../../modules/container-registry"
  environment = var.environment
}

module "dns" {
  source      = "../../modules/dns"
  environment = var.environment
  base_domain = var.base_domain
}

module "monitoring" {
  source      = "../../modules/monitoring"
  environment = var.environment
}
