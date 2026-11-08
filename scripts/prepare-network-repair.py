"""Prepare reviewed imports for this deployment's failed foundation; never print state."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path


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
        args = ["az", "resource", "show", "--ids", resource_id, "--api-version", version,
                "--query", "{id:id,state:properties.provisioningState,reference:" + reference + "}",
                "--output", "json", "--only-show-errors"]
        try:
            result = subprocess.run(args, capture_output=True, text=True, timeout=45)
        except subprocess.TimeoutExpired:
            stop("resource inspection timed out; retry without deleting state.")
        if result.returncode:
            if re.search(r"\((?:ResourceNotFound|ParentResourceNotFound)\)", result.stderr):
                continue
            stop("resource inspection failed; check Azure login/permissions and retry.")
        try:
            metadata = json.loads(result.stdout)
        except ValueError:
            stop("Azure returned invalid resource metadata.")
        if (not isinstance(metadata, dict)
                or str(metadata.get("id", "")).lower() != resource_id.lower()
                or str(metadata.get("reference", "")).lower() != expected_reference.lower()
                or metadata.get("state") not in ["Failed", "Canceled", "Cancelled", "Succeeded"]):
            stop("an existing network resource does not match this foundation or is still changing; inspect it before retrying.")
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
