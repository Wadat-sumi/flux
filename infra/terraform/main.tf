resource "azurerm_resource_group" "flux" {
  name     = var.resource_group_name
  location = var.location
  tags = {
    project    = "flux"
    managed_by = "terraform"
  }
}
