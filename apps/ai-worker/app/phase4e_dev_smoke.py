from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass


@dataclass(frozen=True)
class SmokeConfig:
    base_url: str
    workspace_id: str
    bearer_token: str
    expected_mode: str
    timeout_seconds: float = 120.0


class AgentApiClient:
    def __init__(self, config: SmokeConfig) -> None:
        self.config = config
        self.root = (
            f"{config.base_url.rstrip('/')}/api/v1/workspaces/" f"{config.workspace_id}/agent"
        )

    def create_run(self, prompt: str, request_key: str) -> dict[str, object]:
        return self._request(
            "POST",
            f"{self.root}/runs",
            {"prompt": prompt, "timezone": "Asia/Seoul", "clientRequestId": request_key},
        )["data"]["run"]

    def get_run(self, run_id: str) -> dict[str, object]:
        return self._request("GET", f"{self.root}/runs/{run_id}")["data"]["run"]

    def reject(self, run_id: str, confirmation_id: str) -> None:
        self._request(
            "POST",
            f"{self.root}/runs/{run_id}/confirmations/{confirmation_id}/reject",
            {},
        )

    def _request(
        self, method: str, url: str, body: dict[str, object] | None = None
    ) -> dict[str, object]:
        payload = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(
            url,
            data=payload,
            method=method,
            headers={
                "Authorization": f"Bearer {self.config.bearer_token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                value = json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"Agent smoke API failed with HTTP {error.code}") from error
        if not isinstance(value, dict) or value.get("success") is not True:
            raise RuntimeError("Agent smoke API returned an invalid envelope")
        return value


def wait_for_status(
    client: AgentApiClient, run_id: str, expected: set[str], timeout_seconds: float
) -> dict[str, object]:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        run = client.get_run(run_id)
        status = run.get("status")
        if status in expected:
            return run
        if status in {"failed", "cancelled"}:
            raise RuntimeError(f"Agent smoke run stopped safely with status {status}")
        time.sleep(2)
    raise RuntimeError("Agent smoke run timed out")


def validate_observation(
    run: dict[str, object], expected_mode: str, expected_primary_tool: str
) -> dict[str, object]:
    steps = run.get("steps")
    if not isinstance(steps, list):
        raise ValueError("Agent smoke run has no steps")
    planner_steps = [
        step for step in steps if isinstance(step, dict) and step.get("type") == "planner"
    ]
    retrievals = []
    for step in planner_steps:
        summary = step.get("outputSummary")
        retrieval = summary.get("toolRetrieval") if isinstance(summary, dict) else None
        if isinstance(retrieval, dict):
            retrievals.append(retrieval)
    if not retrievals or any(item.get("mode") != expected_mode for item in retrievals):
        raise ValueError("Agent smoke did not observe the expected retrieval mode")
    if expected_mode == "shortlist" and not any(
        item.get("usedShortlist") is True for item in retrievals
    ):
        raise ValueError("Agent smoke did not exercise a real shortlist")
    if not any(item.get("primaryToolName") == expected_primary_tool for item in retrievals):
        raise ValueError("Agent smoke selected an unexpected primary tool")
    return {
        "plannerStepCount": len(planner_steps),
        "retrievalObservationCount": len(retrievals),
        "expectedPrimaryToolObserved": True,
    }


def validate_tool_step(run: dict[str, object], tool_name: str, *, completed: bool) -> None:
    steps = run.get("steps")
    matches = (
        [
            step
            for step in steps
            if isinstance(step, dict)
            and step.get("type") == "tool"
            and step.get("toolName") == tool_name
        ]
        if isinstance(steps, list)
        else []
    )
    if completed and not any(step.get("status") == "completed" for step in matches):
        raise ValueError(f"Agent smoke did not complete expected tool: {tool_name}")
    if not completed and any(step.get("status") == "completed" for step in matches):
        raise ValueError(f"Agent smoke mutated before confirmation: {tool_name}")
