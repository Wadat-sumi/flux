"""Prepare reviewed imports for this deployment's failed foundation; never print state."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

MISSING_CODES = {"NotFound", "ResourceNotFound", "ParentResourceNotFound"}
KNOWN_CODES = MISSING_CODES | {
    "ResourceGroupNotFound", "AuthorizationFailed", "NotAuthorized",
    "AuthorizationPermissionMismatch", "AuthenticationFailed",
    "InvalidAuthenticationToken", "ExpiredAuthenticationToken",
    "InvalidAuthenticationTokenTenant", "MissingAuthenticationToken",
    "NoRegisteredProviderFound", "MissingSubscriptionRegistration",
    "InvalidApiVersionParameter", "InvalidResourceType", "BadRequest",
    "Conflict", "TooManyRequests", "RequestDisallowedByPolicy",
    "InvalidSubscriptionId", "SubscriptionNotFound", "SubscriptionNotRegistered",
    "InternalServerError", "ServiceUnavailable", "ResourceProviderNotRegistered",
}


def error_code(payload):
    """Return only allowlisted codes, never arbitrary CLI/error payload text."""
    body_code = None
    start = payload.find("{")
    if start >= 0:
        try:
            body, _ = json.JSONDecoder().raw_decode(payload[start:])
            if isinstance(body, dict):
                error = body.get("error", body)
                if isinstance(error, dict):
                    body_code = error.get("code")
        except ValueError:
            pass
    match = re.match(r"\s*(?:ERROR:\s*)?\(([A-Za-z][A-Za-z0-9_]*)\)", payload)
    prefix_code = match[1] if match else None
    # Never turn an authorization/unknown failure into an absent resource, even
    # if another piece of its message happens to mention a 404.
    if prefix_code and prefix_code not in MISSING_CODES:
        return prefix_code if prefix_code in KNOWN_CODES else "Unclassified"
    # An explicit structured non-404 error overrides an HTTP 'Not Found' label.
    if isinstance(body_code, str):
        return body_code if body_code in KNOWN_CODES else "Unclassified"
    if prefix_code:
        return prefix_code
    if re.match(r"\s*(?:ERROR:\s*)?Not Found(?:\s|\(|$)", payload):
        return "NotFound"
    if re.search(r"\b(?:unrecognized arguments|unrecognized command)\b", payload, re.IGNORECASE):
        return "CliArgumentError"
    if re.search(r"(?:Please run|Run)\s+['\"]?az login\b", payload, re.IGNORECASE):
        return "LoginRequired"
    return "Unclassified"


def inspection_failure(address, code, returncode):
    guidance = "Inspect the Azure activity/CLI status for this resource; no state was changed."
    if code in {"AuthorizationFailed", "NotAuthorized", "AuthorizationPermissionMismatch"}:
        guidance = "Check subscription/resource read permissions and Network registration; refresh Azure CLI login if access was recently granted."
    elif code in {"LoginRequired", "AuthenticationFailed", "InvalidAuthenticationToken", "ExpiredAuthenticationToken", "InvalidAuthenticationTokenTenant", "MissingAuthenticationToken"}:
        guidance = "Refresh Azure CLI login and select the deployment subscription, then retry."
    elif code in {"CliArgumentError", "InvalidApiVersionParameter", "InvalidResourceType", "NoRegisteredProviderFound", "MissingSubscriptionRegistration", "ResourceProviderNotRegistered", "SubscriptionNotRegistered"}:
        guidance = "Check Azure CLI/API support and provider registration; this is not treated as a missing resource."
    stop(f"inspection of {address} failed: Azure code {code}; CLI exit {returncode}. {guidance}")


def stop(message):
    sys.exit("Network recovery stopped: " + message)


def write_private(path, value):
    path = Path(path)
    path.write_text(value)
    path.chmod(0o600)


def state_addresses(config, state):
    def resources(module):
        yield from module.get("resources", [])
        for child in module.get("child_modules", []):
            yield from resources(child)

    entries = list(resources(state.get("values", {}).get("root_module", {})))
    groups = [r for r in entries if r.get("address") == "azurerm_resource_group.flux"]
    expected = f"/subscriptions/{config['subscription']}/resourceGroups/{config['group']}"
    if len(groups) != 1:
        stop("the protected application state has no matching resource-group anchor.")
    values = groups[0].get("values", {})
    if (str(values.get("id", "")).lower() != expected.lower()
            or values.get("tags", {}).get("fluxDeploymentId") != config["deployment_id"]):
        stop("the protected application state belongs to another deployment.")
    return [r["address"] for r in entries if r.get("mode") == "managed"]


def prepare_imports(config, addresses):
    prefix = f"/subscriptions/{config['subscription']}/resourceGroups/{config['group']}/providers/"
    vnet = prefix + f"Microsoft.Network/virtualNetworks/{config['app']}-vnet"
    targets = [
        ("azurerm_private_dns_zone_virtual_network_link.database[0]",
         prefix + f"Microsoft.Network/privateDnsZones/{config['app']}.postgres.database.azure.com/virtualNetworkLinks/flux-database",
         "2020-06-01", "properties.virtualNetwork.id", vnet),
        ("azurerm_container_app_environment.backend[0]",
         prefix + f"Microsoft.App/managedEnvironments/{config['app']}-environment",
         "2024-03-01", "properties.vnetConfiguration.infrastructureSubnetId", vnet + "/subnets/containers"),
    ]
    imports = []
    for address, resource_id, version, reference, expected_reference in targets:
        if address in addresses:
            continue
        print("Inspecting Azure metadata: " + address, flush=True)
        # Direct ARM GET avoids generic-resource CLI discovery/child-resource
        # parsing. Azure CLI supplies authentication; URLs contain no credentials.
        args = ["az", "rest", "--method", "get", "--url",
                "https://management.azure.com" + resource_id + "?api-version=" + version,
                "--query", "{id:id,state:properties.provisioningState,reference:" + reference + "}",
                "--output", "json", "--only-show-errors"]
        try:
            result = subprocess.run(args, capture_output=True, text=True, timeout=45)
        except subprocess.TimeoutExpired:
            stop(f"inspection of {address} timed out; retry without deleting state.")
        if result.returncode:
            code = error_code(result.stderr or result.stdout)
            if code in MISSING_CODES:
                print("Azure resource is absent; Terraform will create: " + address)
                continue
            inspection_failure(address, code, result.returncode)
        try:
            metadata = json.loads(result.stdout)
        except ValueError:
            stop(f"Azure returned invalid metadata for {address}.")
        if (not isinstance(metadata, dict)
                or str(metadata.get("id", "")).lower() != resource_id.lower()
                or str(metadata.get("reference", "")).lower() != expected_reference.lower()
                or metadata.get("state") not in ["Failed", "Canceled", "Cancelled", "Succeeded"]):
            stop(f"{address} does not match this foundation or is still changing; inspect it before retrying.")
        imports.append(f"import {{\n  to = {address}\n  id = {json.dumps(resource_id)}\n}}\n")
        print("Planned recovery import: " + address)
    return "\n".join(imports)


if __name__ == "__main__":
    os.umask(0o077)
    action, config_path, output, *extra = sys.argv[1:]
    config = json.loads(Path(config_path).read_text())
    if action == "state":
        try:
            addresses = state_addresses(config, json.load(sys.stdin))
        except (ValueError, KeyError, TypeError, AttributeError):
            stop("invalid protected state metadata; no state values were printed.")
        write_private(output, json.dumps(addresses))
        print("Protected state ownership verified; no values printed.")
    elif action == "imports" and len(extra) == 1:
        write_private(output, prepare_imports(config, json.loads(Path(extra[0]).read_text())))
    else:
        stop("invalid recovery action.")
