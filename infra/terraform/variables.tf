variable "subscription_id" {
  description = "Azure subscription ID. Leave null to use ARM_SUBSCRIPTION_ID."
  type        = string
  default     = null
  nullable    = true
}

variable "location" {
  description = "Static Web Apps region. West Europe is shown in official Azure/Terraform examples."
  type        = string
  default     = "westeurope"
  validation {
    condition     = contains(["westeurope", "eastasia", "centralus", "eastus2", "westus2"], var.location)
    error_message = "Choose a supported Static Web Apps region."
  }
}

variable "resource_group_name" {
  description = "Dedicated new Flux resource group; never target a pre-existing group."
  type        = string
  default     = "flux-quest-rg"
  validation {
    condition     = startswith(var.resource_group_name, "flux-")
    error_message = "Use a dedicated flux- prefixed resource group."
  }
}

variable "app_name" {
  description = "Name of the new Flux Static Web App."
  type        = string
  default     = "flux-quest"
  validation {
    condition     = can(regex("^flux-[a-z0-9-]{2,50}$", var.app_name))
    error_message = "Use a flux- prefixed lowercase app name."
  }
}

variable "sku_tier" {
  description = "Free by default. Standard requires an explicit cost decision."
  type        = string
  default     = "Free"
  validation {
    condition     = contains(["Free", "Standard"], var.sku_tier)
    error_message = "SKU must be Free or Standard."
  }
}
