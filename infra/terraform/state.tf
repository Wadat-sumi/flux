terraform {
  # Supply non-secret storage names at init. Authenticate using Azure CLI / Entra ID.
  backend "azurerm" {}
}
