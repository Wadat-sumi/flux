variable "subscription_id" {
  description = "Azure subscription ID. Leave null to use ARM_SUBSCRIPTION_ID."
  type        = string
  default     = null
  nullable    = true
}

variable "location" {
  description = "Azure resource region; verify Container Apps/PostgreSQL/Key Vault support and quotas at joint review."
  type        = string
  default     = "centralindia"
  validation {
    condition     = contains(["centralindia", "westeurope", "eastasia", "centralus", "eastus2", "westus2"], var.location)
    error_message = "Choose one of the reviewed Azure regions."
  }
}
variable "deployment_id" {
  description = "Non-secret ownership marker used by the guided deployment script."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.deployment_id == null || can(regex("^[a-f0-9-]{36}$", var.deployment_id))
    error_message = "Use the deployment UUID created by the script."
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
  description = "Base name for new full-stack Flux resources."
  type        = string
  default     = "flux-quest"
  validation {
    condition     = length(var.app_name) <= 24 && can(regex("^flux-[a-z0-9][a-z0-9-]*[a-z0-9]$", var.app_name)) && !strcontains(var.app_name, "--")
    error_message = "Use a flux-prefixed lowercase name of 7–24 characters, ending in an alphanumeric with no double hyphens; the migration-job suffix must fit the 32-character limit."
  }
}

variable "enable_backend" {
  description = "Enable paid backend infrastructure only after the joint Azure cost/plan review."
  type        = bool
  default     = false
}
variable "deploy_backend_app" {
  description = "Enable the HTTP service only after image push and successful migration job."
  type        = bool
  default     = false
}
variable "backend_image" {
  description = "Tested ghcr.io/wadat-sumi/flux image pinned by SHA-256 digest. Null creates infrastructure only."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.backend_image == null || can(regex("^ghcr\\.io/wadat-sumi/flux@sha256:[a-f0-9]{64}$", var.backend_image))
    error_message = "Use the immutable ghcr.io/wadat-sumi/flux@sha256:<64 lowercase hex> reference reported by the image workflow."
  }
}
variable "ghcr_private_image" {
  description = "Private GHCR packages use a Key Vault-backed read-only pull token. False requires an explicitly public image."
  type        = bool
  default     = true
}
variable "ghcr_username" {
  description = "Non-secret GitHub username owning the read-only package token; the token value belongs only in Key Vault."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.ghcr_username == null || can(regex("^[A-Za-z0-9][A-Za-z0-9-]{0,38}$", var.ghcr_username))
    error_message = "Use a GitHub username without credentials, URLs or whitespace."
  }
}
variable "ghcr_token_secret_name" {
  description = "Key Vault secret NAME containing the private GHCR read:packages token. Terraform never reads the token value."
  type        = string
  default     = "ghcr-read-token"
  validation {
    condition     = can(regex("^ghcr-[A-Za-z0-9-]{1,122}$", var.ghcr_token_secret_name))
    error_message = "Use a ghcr-prefixed Key Vault secret name, not a token value or database-secret name."
  }
}
variable "backend_database_sku" {
  description = "Billable PostgreSQL SKU; B1ms is a development starting point, not a 120-user Azure capacity claim."
  type        = string
  default     = "B_Standard_B1ms"
}
variable "provision_backend_database" {
  description = "Enable only after database passwords have been entered directly into Key Vault."
  type        = bool
  default     = false
}
variable "enable_tomtom" {
  description = "Enable only after entering the TomTom secret directly into Key Vault through the Azure Portal."
  type        = bool
  default     = false
}
variable "tomtom_secret_name" {
  description = "Key Vault secret name only. No TomTom key value is accepted by Terraform."
  type        = string
  default     = "tomtom-api-key"
  validation {
    condition     = can(regex("^[A-Za-z0-9-]{1,127}$", var.tomtom_secret_name))
    error_message = "Use a valid Key Vault secret name."
  }
}
variable "backend_key_vault_name" {
  description = "Globally unique vault name for provider credentials."
  type        = string
  default     = "flux-quest-vault"
  validation {
    condition     = can(regex("^flux-[a-z0-9-]{3,19}$", var.backend_key_vault_name))
    error_message = "Use a globally unique flux-prefixed Key Vault name, at most 24 characters."
  }
}
variable "key_vault_admin_ip_rules" {
  description = "Explicit IPv4 CIDRs allowed for Portal secret entry during joint review; prefer the owner's /32."
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for cidr in var.key_vault_admin_ip_rules : can(cidrhost(cidr, 0)) && can(regex("^[0-9.]+/", cidr))])
    error_message = "Specify valid IPv4 CIDRs; the default allows no external data-plane clients."
  }
}
variable "backend_allow_registration" {
  description = "Explicitly enable account signup after reviewing abuse/cost controls."
  type        = bool
  default     = false
}
variable "grant_operator_secret_access" {
  description = "Grant the authenticated deploying identity Secrets Officer on the new Flux vault for Portal entry and provisioning."
  type        = bool
  default     = false
}
