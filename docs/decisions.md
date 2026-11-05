# Flux decisions

## ADR 001: Browser-native scientific core

Accepted 5 November 2026. Use an independent TypeScript IDM-based engine and module worker. This permits static Azure hosting and direct headless tests. Fixed 1/30 s physics and separate demand/behavior random streams support reproducible comparisons. Simplified control policies and their biases are documented in the methodology.

## ADR 002: Azure infrastructure and credential prerequisite

Accepted 5 November 2026. Use Terraform-pinned azurerm 4.6.0 and Azure Static Web Apps Free in a new dedicated Flux resource group. Disable automatic provider registration. Validate offline; do not run plan/apply before verified Azure authentication. Do not substitute hosting providers.

## ADR 003: Owner-selected visual design

Accepted 5 November 2026. The owner chose C — Layered City (“Lets go with C”) after reviewing exactly three proposals and before application UI code. Use muted isometric geometry and violet vehicles to make flyovers visible, with plan view for precise editing. Tokens, responsive behavior and deliberate dependency choices are recorded in design.md. Azure deployment remains deferred to the joint review on 6 November.
