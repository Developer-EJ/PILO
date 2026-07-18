from __future__ import annotations

import argparse
import json
import os
import secrets
from pathlib import Path

from app.phase4e_dev_smoke import (
    AgentApiClient,
    SmokeConfig,
    validate_observation,
    validate_tool_step,
    wait_for_status,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run privacy-safe Phase 4-E dev Agent smoke.")
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument("--expected-mode", choices=("shadow", "shortlist"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    token = os.environ.get("PHASE4E_DEV_AGENT_TOKEN")
    if not token:
        raise SystemExit("PHASE4E_DEV_AGENT_TOKEN is required")

    client = AgentApiClient(
        SmokeConfig(args.base_url, args.workspace_id, token, args.expected_mode)
    )
    nonce = secrets.token_hex(12)
    read = client.create_run("최근 회의록 보여줘", f"phase4e-read-{nonce}")
    read_id = str(read["id"])
    read = wait_for_status(client, read_id, {"completed"}, 120)
    read_observation = validate_observation(read, args.expected_mode, "get_meeting_report")
    validate_tool_step(read, "get_meeting_report", completed=True)

    write = client.create_run("녹음 끝내줘", f"phase4e-write-{nonce}")
    write_id = str(write["id"])
    write = wait_for_status(client, write_id, {"waiting_confirmation"}, 120)
    write_observation = validate_observation(write, args.expected_mode, "end_meeting_recording")
    validate_tool_step(write, "end_meeting_recording", completed=False)
    confirmation = write.get("confirmation")
    if not isinstance(confirmation, dict) or confirmation.get("status") != "pending":
        raise ValueError("Agent smoke write did not create a pending confirmation")
    client.reject(write_id, str(confirmation["id"]))
    rejected = wait_for_status(client, write_id, {"cancelled"}, 30)
    validate_tool_step(rejected, "end_meeting_recording", completed=False)

    report = {
        "format": "phase4e-agent-dev-smoke:v2",
        "passed": True,
        "mode": args.expected_mode,
        "checks": {
            "readCompleted": True,
            "writeWaitingConfirmation": True,
            "mutationBeforeConfirmation": False,
            "confirmationRejectedForCleanup": True,
            "mutationAfterRejection": False,
        },
        "observations": {"read": read_observation, "write": write_observation},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
