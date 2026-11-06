# Real values are entered into Key Vault through the Portal, never Terraform inputs.
# PostgreSQL provisioning necessarily reads the admin credential: protected state is mandatory.
data "azurerm_key_vault_secret" "database_admin_password" {
  count        = local.database_enabled ? 1 : 0
  name         = "database-admin-password"
  key_vault_id = azurerm_key_vault.backend[0].id
}
data "azurerm_key_vault_secret" "database_app_password" {
  count        = local.database_enabled ? 1 : 0
  name         = "database-app-password"
  key_vault_id = azurerm_key_vault.backend[0].id
}
resource "azurerm_key_vault_secret" "runtime_url" {
  count        = local.database_enabled ? 1 : 0
  name         = "database-runtime-url"
  value        = local.runtime_url
  key_vault_id = azurerm_key_vault.backend[0].id
  content_type = "PostgreSQL connection string; restricted runtime role; TLS verify-full"
}
resource "azurerm_key_vault_secret" "bootstrap_url" {
  count        = local.database_enabled ? 1 : 0
  name         = "database-bootstrap-url"
  value        = local.migration_url
  key_vault_id = azurerm_key_vault.backend[0].id
  content_type = "PostgreSQL connection string; administrative migration job only"
}
resource "azurerm_user_assigned_identity" "migration" {
  count               = var.enable_backend ? 1 : 0
  name                = "${var.app_name}-migration"
  location            = azurerm_resource_group.flux.location
  resource_group_name = azurerm_resource_group.flux.name
  tags                = local.backend_tags
}
resource "azurerm_role_assignment" "migration_image_pull" {
  count                = var.enable_backend ? 1 : 0
  scope                = azurerm_container_registry.backend[0].id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.migration[0].principal_id
}
resource "azurerm_role_assignment" "runtime_secret_reader" {
  count                = local.database_enabled ? 1 : 0
  scope                = "${azurerm_key_vault.backend[0].id}/secrets/${azurerm_key_vault_secret.runtime_url[0].name}"
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.backend[0].principal_id
}
resource "azurerm_role_assignment" "migration_secret_reader" {
  for_each             = local.database_enabled ? toset(["database-runtime-url", "database-bootstrap-url"]) : toset([])
  scope                = "${azurerm_key_vault.backend[0].id}/secrets/${each.key}"
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.migration[0].principal_id
  depends_on           = [azurerm_key_vault_secret.runtime_url, azurerm_key_vault_secret.bootstrap_url]
}
