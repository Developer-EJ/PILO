from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create planner evaluation inputs from an App Server registry snapshot."
    )
    parser.add_argument("--registry-snapshot", type=Path, required=True)
    parser.add_argument("--tool-snapshot-output", type=Path, required=True)
    parser.add_argument("--catalog-output", type=Path, required=True)
    args = parser.parse_args()

    root = json.loads(args.registry_snapshot.read_text(encoding="utf-8"))
    inventory = root.get("inventory")
    schemas = root.get("eligibleToolSchemas")
    catalog = root.get("toolCapabilityCatalog")
    if not isinstance(inventory, dict) or not isinstance(schemas, dict):
        raise ValueError("Invalid registry evaluation snapshot")
    if not isinstance(catalog, dict) or not isinstance(catalog.get("descriptors"), list):
        raise ValueError("Invalid registry capability catalog")

    descriptors = {
        descriptor.get("toolName"): descriptor
        for descriptor in catalog["descriptors"]
        if isinstance(descriptor, dict) and isinstance(descriptor.get("toolName"), str)
    }
    tools = []
    for name, schema in sorted(schemas.items()):
        descriptor = descriptors.get(name)
        if not isinstance(name, str) or not isinstance(schema, dict) or descriptor is None:
            raise ValueError("Registry descriptor and schema inventory do not match")
        when_to_use = descriptor.get("whenToUse")
        must_not_use_for = descriptor.get("mustNotUseFor")
        if not isinstance(when_to_use, str) or not isinstance(must_not_use_for, list):
            raise ValueError(f"Invalid registry descriptor: {name}")
        description = when_to_use.strip()
        exclusions = [item.strip() for item in must_not_use_for if isinstance(item, str) and item]
        if exclusions:
            description += " 사용하지 말아야 할 요청: " + "; ".join(exclusions)
        tools.append(
            {
                "name": name,
                "description": description,
                "riskLevel": descriptor.get("riskLevel"),
                "executionMode": descriptor.get("executionMode"),
                "inputSchema": schema,
            }
        )

    tool_schema_version = inventory.get("version")
    if not isinstance(tool_schema_version, str):
        raise ValueError("Registry tool schema version is missing")
    tool_snapshot = {
        "version": "phase4e-registry-evaluation:v1",
        "toolSchemaVersion": tool_schema_version,
        "tools": tools,
        # load_meeting_regression_suite replaces this bootstrap case with the selected
        # Meeting variant after it validates the common planner-suite envelope.
        "cases": [
            {
                "id": "phase4e-bootstrap",
                "prompt": "Phase 4-E bootstrap",
                "expected": {"status": "needs_clarification"},
            }
        ],
    }
    for path, value in (
        (args.tool_snapshot_output, tool_snapshot),
        (args.catalog_output, catalog),
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
