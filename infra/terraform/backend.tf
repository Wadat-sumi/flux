locals {
  database_enabled  = var.enable_backend && var.provision_backend_database
  image_enabled     = local.database_enabled && var.backend_image != null
  ghcr_auth_enabled = local.image_enabled && var.ghcr_private_image
  backend_tags      = { project = "flux", managed_by = "terraform" }
  backend_image     = var.backend_image == null ? "unused" : var.backend_image
  runtime_url       = local.database_enabled ? "postgresql://flux_app:${replace(urlencode(data.azurerm_key_vault_secret.database_app_password[0].value), "+", "%20")}@${azurerm_postgresql_flexible_server.backend[0].fqdn}:5432/flux?sslmode=verify-full" : null
  migration_url     = local.database_enabled ? "postgresql://flux_admin:${replace(urlencode(data.azurerm_key_vault_secret.database_admin_password[0].value), "+", "%20")}@${azurerm_postgresql_flexible_server.backend[0].fqdn}:5432/flux?sslmode=verify-full" : null
}

resource "azurerm_virtual_network" "backend" {
  count               = var.enable_backend ? 1 : 0
  name                = "${var.app_name}-vnet"
  location            = azurerm_resource_group.flux.location
  resource_group_name = azurerm_resource_group.flux.name
  address_space       = ["10.88.0.0/16"]
  tags                = local.backend_tags
}
resource "azurerm_subnet" "containers" {
  count                = var.enable_backend ? 1 : 0
  name                 = "containers"
  resource_group_name  = azurerm_resource_group.flux.name
  virtual_network_name = azurerm_virtual_network.backend[0].name
  address_prefixes     = ["10.88.0.0/23"]
  service_endpoints    = ["Microsoft.KeyVault"]
}
data "azurerm_client_config" "backend" {
  count = var.enable_backend ? 1 : 0
}
resource "azurerm_key_vault" "backend" {
  count                         = var.enable_backend ? 1 : 0
  name                          = var.backend_key_vault_name
  location                      = azurerm_resource_group.flux.location
  resource_group_name           = azurerm_resource_group.flux.name
  tenant_id                     = data.azurerm_client_config.backend[0].tenant_id
  sku_name                      = "standard"
  enable_rbac_authorization     = true
  soft_delete_retention_days    = 7
  purge_protection_enabled      = true
  public_network_access_enabled = true
  tags                          = local.backend_tags
  network_acls {
    bypass                     = "None"
    default_action             = "Deny"
    virtual_network_subnet_ids = [azurerm_subnet.containers[0].id]
    ip_rules                   = var.key_vault_admin_ip_rules
  }
}
resource "azurerm_role_assignment" "key_vault_reader" {
  count                = var.enable_backend && var.enable_tomtom ? 1 : 0
  scope                = "${azurerm_key_vault.backend[0].id}/secrets/${var.tomtom_secret_name}"
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.backend[0].principal_id
}
resource "azurerm_subnet" "database" {
  count                = var.enable_backend ? 1 : 0
  name                 = "database"
  resource_group_name  = azurerm_resource_group.flux.name
  virtual_network_name = azurerm_virtual_network.backend[0].name
  address_prefixes     = ["10.88.2.0/24"]
  delegation {
    name = "postgresql"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}
resource "azurerm_private_dns_zone" "database" {
  count               = var.enable_backend ? 1 : 0
  name                = "${var.app_name}.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.flux.name
  tags                = local.backend_tags
}
resource "azurerm_private_dns_zone_virtual_network_link" "database" {
  count                 = var.enable_backend ? 1 : 0
  name                  = "flux-database"
  private_dns_zone_name = azurerm_private_dns_zone.database[0].name
  resource_group_name   = azurerm_resource_group.flux.name
  virtual_network_id    = azurerm_virtual_network.backend[0].id
}
resource "azurerm_postgresql_flexible_server" "backend" {
  count                         = local.database_enabled ? 1 : 0
  name                          = "${var.app_name}-db"
  location                      = azurerm_resource_group.flux.location
  resource_group_name           = azurerm_resource_group.flux.name
  version                       = "16"
  delegated_subnet_id           = azurerm_subnet.database[0].id
  private_dns_zone_id           = azurerm_private_dns_zone.database[0].id
  public_network_access_enabled = false
  administrator_login           = "flux_admin"
  administrator_password        = data.azurerm_key_vault_secret.database_admin_password[0].value
  sku_name                      = var.backend_database_sku
  storage_mb                    = 32768
  backup_retention_days         = 7
  geo_redundant_backup_enabled  = false
  tags                          = local.backend_tags
  depends_on                    = [azurerm_private_dns_zone_virtual_network_link.database]
  lifecycle {
    precondition {
      condition     = length(data.azurerm_key_vault_secret.database_admin_password[0].value) >= 24 && length(data.azurerm_key_vault_secret.database_app_password[0].value) >= 24 && data.azurerm_key_vault_secret.database_admin_password[0].value != data.azurerm_key_vault_secret.database_app_password[0].value
      error_message = "Enter distinct 24+ character admin/runtime credentials into Key Vault through the Portal before enabling the database stage."
    }
  }
}
resource "azurerm_postgresql_flexible_server_database" "backend" {
  count     = local.database_enabled ? 1 : 0
  name      = "flux"
  server_id = azurerm_postgresql_flexible_server.backend[0].id
  charset   = "UTF8"
  collation = "en_US.utf8"
}
resource "azurerm_user_assigned_identity" "backend" {
  count               = var.enable_backend ? 1 : 0
  name                = "${var.app_name}-runtime"
  location            = azurerm_resource_group.flux.location
  resource_group_name = azurerm_resource_group.flux.name
  tags                = local.backend_tags
}
resource "azurerm_log_analytics_workspace" "backend" {
  count               = var.enable_backend ? 1 : 0
  name                = "${var.app_name}-logs"
  location            = azurerm_resource_group.flux.location
  resource_group_name = azurerm_resource_group.flux.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.backend_tags
}
resource "azurerm_container_app_environment" "backend" {
  count                      = var.enable_backend ? 1 : 0
  name                       = "${var.app_name}-environment"
  location                   = azurerm_resource_group.flux.location
  resource_group_name        = azurerm_resource_group.flux.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.backend[0].id
  infrastructure_subnet_id   = azurerm_subnet.containers[0].id
  tags                       = local.backend_tags
}
resource "azurerm_container_app_job" "migrate" {
  count                        = local.image_enabled ? 1 : 0
  name                         = "${var.app_name}-migrate"
  location                     = azurerm_resource_group.flux.location
  resource_group_name          = azurerm_resource_group.flux.name
  container_app_environment_id = azurerm_container_app_environment.backend[0].id
  replica_timeout_in_seconds   = 300
  replica_retry_limit          = 0
  tags                         = local.backend_tags
  manual_trigger_config { parallelism = 1 }
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.migration[0].id]
  }
  dynamic "registry" {
    for_each = local.ghcr_auth_enabled ? [1] : []
    content {
      server               = "ghcr.io"
      username             = var.ghcr_username
      password_secret_name = "ghcr-read-token"
    }
  }
  dynamic "secret" {
    for_each = local.ghcr_auth_enabled ? [1] : []
    content {
      name                = "ghcr-read-token"
      identity            = azurerm_user_assigned_identity.migration[0].id
      key_vault_secret_id = "${azurerm_key_vault.backend[0].vault_uri}secrets/${var.ghcr_token_secret_name}"
    }
  }
  secret {
    name                = "database-runtime"
    identity            = azurerm_user_assigned_identity.migration[0].id
    key_vault_secret_id = azurerm_key_vault_secret.runtime_url[0].versionless_id
  }
  secret {
    name                = "database-bootstrap"
    identity            = azurerm_user_assigned_identity.migration[0].id
    key_vault_secret_id = azurerm_key_vault_secret.bootstrap_url[0].versionless_id
  }
  template {
    container {
      name    = "migrate"
      image   = local.backend_image
      cpu     = 0.5
      memory  = "1Gi"
      command = ["node", "dist-server/migrate.mjs"]
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "FLUX_SECRETS_SOURCE"
        value = "azure-key-vault"
      }
      env {
        name        = "DATABASE_URL"
        secret_name = "database-runtime"
      }
      env {
        name        = "BOOTSTRAP_DATABASE_URL"
        secret_name = "database-bootstrap"
      }
    }
  }
  lifecycle {
    precondition {
      condition     = !var.ghcr_private_image || var.ghcr_username != null
      error_message = "Set the non-secret GHCR token owner's username and enter the read-only token directly in Key Vault before creating the private-image job."
    }
  }
  depends_on = [azurerm_role_assignment.ghcr_migration_reader, azurerm_role_assignment.migration_secret_reader, azurerm_postgresql_flexible_server_database.backend]
}
resource "azurerm_container_app" "backend" {
  count                        = local.database_enabled && var.deploy_backend_app ? 1 : 0
  name                         = "${var.app_name}-api"
  resource_group_name          = azurerm_resource_group.flux.name
  container_app_environment_id = azurerm_container_app_environment.backend[0].id
  revision_mode                = "Single"
  tags                         = local.backend_tags
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.backend[0].id]
  }
  dynamic "registry" {
    for_each = local.ghcr_auth_enabled ? [1] : []
    content {
      server               = "ghcr.io"
      username             = var.ghcr_username
      password_secret_name = "ghcr-read-token"
    }
  }
  dynamic "secret" {
    for_each = local.ghcr_auth_enabled ? [1] : []
    content {
      name                = "ghcr-read-token"
      identity            = azurerm_user_assigned_identity.backend[0].id
      key_vault_secret_id = "${azurerm_key_vault.backend[0].vault_uri}secrets/${var.ghcr_token_secret_name}"
    }
  }
  secret {
    name                = "database-runtime"
    identity            = azurerm_user_assigned_identity.backend[0].id
    key_vault_secret_id = azurerm_key_vault_secret.runtime_url[0].versionless_id
  }
  dynamic "secret" {
    for_each = var.enable_tomtom ? [1] : []
    content {
      name                = "tomtom-api-key"
      identity            = azurerm_user_assigned_identity.backend[0].id
      key_vault_secret_id = "${azurerm_key_vault.backend[0].vault_uri}secrets/${var.tomtom_secret_name}"
    }
  }
  ingress {
    external_enabled           = true
    target_port                = 3001
    allow_insecure_connections = false
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
  template {
    min_replicas = 1
    max_replicas = 1
    container {
      name   = "flux"
      image  = local.backend_image
      cpu    = 1
      memory = "2Gi"
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "FLUX_SECRETS_SOURCE"
        value = "azure-key-vault"
      }
      env {
        name  = "FLUX_HOST"
        value = "0.0.0.0"
      }
      env {
        name  = "PUBLIC_ORIGIN"
        value = "https://${var.app_name}-api.${azurerm_container_app_environment.backend[0].default_domain}"
      }
      env {
        name  = "FLUX_ALLOW_REGISTRATION"
        value = tostring(var.backend_allow_registration)
      }
      env {
        name        = "DATABASE_URL"
        secret_name = "database-runtime"
      }
      dynamic "env" {
        for_each = var.enable_tomtom ? [1] : []
        content {
          name        = "TOMTOM_API_KEY"
          secret_name = "tomtom-api-key"
        }
      }
      readiness_probe {
        transport = "HTTP"
        port      = 3001
        path      = "/api/health"
      }
      liveness_probe {
        transport        = "HTTP"
        port             = 3001
        path             = "/api/health"
        initial_delay    = 10
        interval_seconds = 30
      }
    }
  }
  lifecycle {
    precondition {
      condition     = var.backend_image != null
      error_message = "Push the tested Flux image and run the administrative migration job before enabling deploy_backend_app."
    }
    precondition {
      condition     = !var.ghcr_private_image || var.ghcr_username != null
      error_message = "Set ghcr_username for a private GHCR image; the read-only token must exist in Key Vault."
    }
  }
  depends_on = [azurerm_role_assignment.ghcr_runtime_reader, azurerm_role_assignment.key_vault_reader, azurerm_role_assignment.runtime_secret_reader]
}
