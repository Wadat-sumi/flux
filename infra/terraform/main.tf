resource "azurerm_resource_group" "flux" {
  name     = var.resource_group_name
  location = var.location
  tags = merge({
    project    = "flux"
    managed_by = "terraform"
  }, var.deployment_id == null ? {} : { fluxDeploymentId = var.deployment_id })
}
