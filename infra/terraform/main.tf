resource "azurerm_resource_group" "flux" {
  name     = var.resource_group_name
  location = var.location
  tags = {
    project    = "flux"
    managed_by = "terraform"
  }
}

resource "azurerm_static_web_app" "flux" {
  name                = var.app_name
  resource_group_name = azurerm_resource_group.flux.name
  location            = azurerm_resource_group.flux.location
  sku_tier            = var.sku_tier
  sku_size            = var.sku_tier
  tags = {
    project    = "flux"
    managed_by = "terraform"
  }
}
