# Local mock provider only: these plans never authenticate or contact Azure.
mock_provider "azurerm" {
  mock_data "azurerm_client_config" {
    defaults = { tenant_id = "00000000-0000-0000-0000-000000000001" }
  }
}

override_data {
  target = data.azurerm_key_vault_secret.database_admin_password[0]
  values = { value = "Synthetic-Admin-Fixture-Only-12345" }
}
override_data {
  target = data.azurerm_key_vault_secret.database_app_password[0]
  values = { value = "Synthetic-Runtime-Fixture-Only-67890" }
}

run "disabled" {
  command = plan
  assert {
    condition     = length(azurerm_container_app.backend) == 0 && length(azurerm_container_app_job.migrate) == 0 && length(azurerm_role_assignment.ghcr_runtime_reader) == 0
    error_message = "The default must not create paid application infrastructure or pull credentials."
  }
  assert {
    condition     = output.backend_registry == "ghcr.io/wadat-sumi/flux"
    error_message = "The external package must be GHCR."
  }
}
run "foundation" {
  command = plan
  variables { enable_backend = true }
  assert {
    condition     = length(azurerm_key_vault.backend) == 1 && length(azurerm_container_app_job.migrate) == 0 && length(data.azurerm_key_vault_secret.database_admin_password) == 0
    error_message = "Foundation provisioning must not read passwords or start applications."
  }
}
run "private_image_job" {
  command = plan
  variables {
    enable_backend             = true
    provision_backend_database = true
    backend_image              = "ghcr.io/wadat-sumi/flux@sha256:0000000000000000000000000000000000000000000000000000000000000000"
    ghcr_username              = "Wadat-sumi"
  }
  assert {
    condition     = one(azurerm_container_app_job.migrate[0].registry).server == "ghcr.io" && one(azurerm_container_app_job.migrate[0].registry).password_secret_name == "ghcr-read-token"
    error_message = "Private GHCR pulls must use the named Key Vault-backed secret."
  }
  assert {
    condition     = length(azurerm_role_assignment.ghcr_migration_reader) == 1 && length(azurerm_container_app.backend) == 0
    error_message = "The migration identity gets secret-scoped access before service deployment."
  }
}
run "public_image_without_credentials" {
  command = plan
  variables {
    enable_backend             = true
    provision_backend_database = true
    backend_image              = "ghcr.io/wadat-sumi/flux@sha256:0000000000000000000000000000000000000000000000000000000000000000"
    ghcr_private_image         = false
  }
  assert {
    condition     = length(azurerm_container_app_job.migrate[0].registry) == 0 && length(azurerm_role_assignment.ghcr_migration_reader) == 0
    error_message = "An explicitly public package needs no GHCR credential or GHCR secret grant."
  }
}
run "private_service" {
  command = plan
  variables {
    enable_backend             = true
    provision_backend_database = true
    deploy_backend_app         = true
    backend_image              = "ghcr.io/wadat-sumi/flux@sha256:0000000000000000000000000000000000000000000000000000000000000000"
    ghcr_username              = "Wadat-sumi"
  }
  assert {
    condition     = one(azurerm_container_app.backend[0].registry).server == "ghcr.io" && one(azurerm_container_app.backend[0].registry).password_secret_name == "ghcr-read-token" && length(azurerm_role_assignment.ghcr_runtime_reader) == 1
    error_message = "The service must pull the same private GHCR image with a scoped vault reference."
  }
}
run "private_username_required" {
  command = plan
  variables {
    enable_backend             = true
    provision_backend_database = true
    backend_image              = "ghcr.io/wadat-sumi/flux@sha256:0000000000000000000000000000000000000000000000000000000000000000"
  }
  expect_failures = [azurerm_container_app_job.migrate]
}
run "mutable_image_rejected" {
  command = plan
  variables { backend_image = "ghcr.io/wadat-sumi/flux:latest" }
  expect_failures = [var.backend_image]
}
run "foreign_registry_rejected" {
  command = plan
  variables { backend_image = "example.azurecr.io/flux:latest" }
  expect_failures = [var.backend_image]
}
run "short_digest_rejected" {
  command = plan
  variables { backend_image = "ghcr.io/wadat-sumi/flux@sha256:abcd" }
  expect_failures = [var.backend_image]
}
run "credential_url_rejected" {
  command = plan
  variables { ghcr_username = "https://user:password@example.test" }
  expect_failures = [var.ghcr_username]
}
run "overlong_job_name_rejected" {
  command = plan
  variables { app_name = "flux-12345678901234567890" }
  expect_failures = [var.app_name]
}
run "invalid_job_hyphens_rejected" {
  command = plan
  variables { app_name = "flux-test--job" }
  expect_failures = [var.app_name]
}
run "database_secret_cannot_be_registry_credential" {
  command = plan
  variables { ghcr_token_secret_name = "database-bootstrap-url" }
  expect_failures = [var.ghcr_token_secret_name]
}
