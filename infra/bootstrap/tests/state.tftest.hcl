mock_provider "azurerm" {}
mock_provider "azapi" {}
variables {
  subscription_id      = "22222222-2222-4222-8222-222222222222"
  deployment_id        = "11111111-1111-4111-8111-111111111111"
  resource_group_name  = "flux-state-test-rg"
  storage_account_name = "fluxstatetest"
  operator_ip          = "8.8.8.8/32"
}
run "protected_state" {
  command = plan
  assert {
    condition     = azurerm_resource_group.state.location == "centralindia" && azurerm_resource_group.state.tags.fluxDeploymentId == var.deployment_id
    error_message = "Bootstrap must target Central India with deployment ownership."
  }
  assert {
    condition     = azapi_resource.storage.body.properties.allowSharedKeyAccess == false && azapi_resource.storage.body.properties.allowBlobPublicAccess == false && azapi_resource.storage.body.properties.networkAcls.defaultAction == "Deny" && azapi_resource.storage.body.properties.networkAcls.ipRules[0].value == "8.8.8.8"
    error_message = "State storage must reject keys/public blobs and allow only the detected operator IPv4."
  }
  assert {
    condition     = azapi_update_resource.blobs.body.properties.isVersioningEnabled && azapi_update_resource.blobs.body.properties.deleteRetentionPolicy.days == 30 && azapi_update_resource.blobs.body.properties.containerDeleteRetentionPolicy.days == 30 && azapi_resource.container.body.properties.publicAccess == "None"
    error_message = "State must have private blobs, versioning and soft delete."
  }
  assert {
    condition     = azurerm_role_assignment.operator.role_definition_name == "Storage Blob Data Contributor"
    error_message = "The operator needs Entra Blob access without account keys."
  }
}
run "wide_network_rejected" {
  command = plan
  variables { operator_ip = "0.0.0.0/0" }
  expect_failures = [var.operator_ip]
}
