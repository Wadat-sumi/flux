output "default_hostname" {
  description = "Hostname of Flux on Azure Static Web Apps."
  value       = azurerm_static_web_app.flux.default_host_name
}

output "url" {
  description = "Public HTTPS Flux deployment URL."
  value       = "https://${azurerm_static_web_app.flux.default_host_name}"
}

output "deployment_token" {
  description = "Secret deployment token; never print, commit or paste into chat."
  value       = azurerm_static_web_app.flux.api_key
  sensitive   = true
}
