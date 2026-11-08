# Run from the private .flux-deploy/bootstrap working copy. This state contains
# infrastructure metadata only; it never requests storage keys or vault values.
terraform {
  required_version = ">= 1.9.0, < 2.0.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "4.6.0"
    }
    azapi = {
      source  = "Azure/azapi"
      version = "2.1.0"
    }
  }
}
provider "azurerm" {
  features {}
  subscription_id                 = var.subscription_id
  resource_provider_registrations = "none"
}
provider "azapi" {
  subscription_id  = var.subscription_id
  enable_preflight = false
}
variable "subscription_id" { type = string }
variable "deployment_id" { type = string }
variable "resource_group_name" { type = string }
variable "storage_account_name" { type = string }
variable "operator_ip" {
  type = string
  validation {
    condition     = can(cidrhost(var.operator_ip, 0)) && endswith(var.operator_ip, "/32") && can(regex("^[0-9.]+/32$", var.operator_ip))
    error_message = "The detected operator address must be an IPv4 /32."
  }
}
data "azurerm_client_config" "operator" {}
resource "azurerm_resource_group" "state" {
  name     = var.resource_group_name
  location = "centralindia"
  tags     = { project = "flux", managed_by = "terraform", fluxDeploymentId = var.deployment_id }
  lifecycle { prevent_destroy = true }
}
# Use ARM resources rather than the AzureRM storage-account resource, whose
# read path lists account keys even when shared-key authentication is disabled.
resource "azapi_resource" "storage" {
  type      = "Microsoft.Storage/storageAccounts@2023-05-01"
  name      = var.storage_account_name
  parent_id = azurerm_resource_group.state.id
  location  = azurerm_resource_group.state.location
  tags      = azurerm_resource_group.state.tags
  body = {
    kind = "StorageV2"
    sku  = { name = "Standard_LRS" }
    properties = {
      minimumTlsVersion            = "TLS1_2"
      supportsHttpsTrafficOnly     = true
      allowSharedKeyAccess         = false
      allowBlobPublicAccess        = false
      defaultToOAuthAuthentication = true
      publicNetworkAccess          = "Enabled"
      networkAcls = {
        bypass              = "None"
        defaultAction       = "Deny"
        ipRules             = [{ value = trimsuffix(var.operator_ip, "/32"), action = "Allow" }]
        virtualNetworkRules = []
      }
    }
  }
  response_export_values = []
  lifecycle { prevent_destroy = true }
}
resource "azapi_update_resource" "blobs" {
  type      = "Microsoft.Storage/storageAccounts/blobServices@2023-05-01"
  name      = "default"
  parent_id = azapi_resource.storage.id
  body = {
    properties = {
      isVersioningEnabled            = true
      deleteRetentionPolicy          = { enabled = true, days = 30 }
      containerDeleteRetentionPolicy = { enabled = true, days = 30 }
    }
  }
  response_export_values = []
  lifecycle { prevent_destroy = true }
}
resource "azapi_resource" "container" {
  type                   = "Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01"
  name                   = "tfstate"
  parent_id              = azapi_update_resource.blobs.id
  body                   = { properties = { publicAccess = "None" } }
  response_export_values = []
  lifecycle { prevent_destroy = true }
}
resource "azurerm_role_assignment" "operator" {
  scope                = azapi_resource.storage.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = data.azurerm_client_config.operator.object_id
}
