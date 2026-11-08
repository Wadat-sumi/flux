output "url" {
  description = "Full-stack public HTTPS origin after reviewed deployment."
  value       = local.database_enabled && var.deploy_backend_app ? "https://${azurerm_container_app.backend[0].ingress[0].fqdn}" : null
}
output "backend_registry" {
  value       = "ghcr.io/wadat-sumi/flux"
  description = "External GitHub package location; Terraform creates no container registry."
}
output "backend_url" {
  value       = local.database_enabled && var.deploy_backend_app ? "https://${azurerm_container_app.backend[0].ingress[0].fqdn}" : null
  description = "Full-stack HTTPS origin, available after migrations and service deployment."
}
output "tomtom_secret_reference" {
  value       = var.enable_backend ? "${azurerm_key_vault.backend[0].vault_uri}secrets/${var.tomtom_secret_name}" : null
  description = "Non-secret URI only; enter the actual value through the Azure Portal, never Terraform."
}
