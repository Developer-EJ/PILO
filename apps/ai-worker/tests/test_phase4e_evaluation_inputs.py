import json
import subprocess
import sys
from pathlib import Path


def test_phase4e_evaluation_inputs_are_derived_from_registry(tmp_path: Path) -> None:
    registry = {
        "inventory": {"version": "agent-tools:v7"},
        "eligibleToolSchemas": {"get_meeting_report": {"type": "object", "properties": {}}},
        "toolCapabilityCatalog": {
            "version": "agent-tool-capabilities:v2",
            "sha256": "a" * 64,
            "capabilities": [],
            "descriptors": [
                {
                    "toolName": "get_meeting_report",
                    "whenToUse": "회의록을 조회할 때",
                    "mustNotUseFor": ["회의록을 수정할 때"],
                    "riskLevel": "low",
                    "executionMode": "contextual",
                }
            ],
        },
    }
    registry_path = tmp_path / "registry.json"
    tools_path = tmp_path / "tools.json"
    catalog_path = tmp_path / "catalog.json"
    registry_path.write_text(json.dumps(registry), encoding="utf-8")

    subprocess.run(
        [
            sys.executable,
            "scripts/export_phase4e_evaluation_inputs.py",
            "--registry-snapshot",
            str(registry_path),
            "--tool-snapshot-output",
            str(tools_path),
            "--catalog-output",
            str(catalog_path),
        ],
        check=True,
        cwd=Path(__file__).parents[1],
    )

    tools = json.loads(tools_path.read_text(encoding="utf-8"))
    assert tools["toolSchemaVersion"] == "agent-tools:v7"
    assert tools["tools"][0]["name"] == "get_meeting_report"
    assert "사용하지 말아야 할 요청" in tools["tools"][0]["description"]
    assert json.loads(catalog_path.read_text(encoding="utf-8"))["sha256"] == "a" * 64
