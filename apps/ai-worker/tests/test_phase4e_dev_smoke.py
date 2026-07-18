import pytest

from app.phase4e_dev_smoke import validate_observation, validate_tool_step


def run(tool_status: str = "pending", mode: str = "shortlist") -> dict[str, object]:
    return {
        "steps": [
            {
                "type": "planner",
                "outputSummary": {
                    "toolRetrieval": {"mode": mode, "usedShortlist": mode == "shortlist"}
                },
            },
            {"type": "tool", "toolName": "end_meeting_recording", "status": tool_status},
        ]
    }


def test_dev_smoke_requires_real_shortlist_observation() -> None:
    value = run()
    value["steps"][0]["outputSummary"]["toolRetrieval"]["primaryToolName"] = "end_meeting_recording"
    assert (
        validate_observation(value, "shortlist", "end_meeting_recording")[
            "retrievalObservationCount"
        ]
        == 1
    )
    with pytest.raises(ValueError, match="expected retrieval mode"):
        validate_observation(run(mode="shadow"), "shortlist", "end_meeting_recording")


def test_dev_smoke_accepts_shadow_with_the_expected_primary_tool() -> None:
    value = run(mode="shadow")
    value["steps"][0]["outputSummary"]["toolRetrieval"]["primaryToolName"] = "end_meeting_recording"
    assert (
        validate_observation(value, "shadow", "end_meeting_recording")[
            "expectedPrimaryToolObserved"
        ]
        is True
    )


def test_dev_smoke_rejects_write_completed_before_confirmation() -> None:
    validate_tool_step(run(), "end_meeting_recording", completed=False)
    with pytest.raises(ValueError, match="mutated before confirmation"):
        validate_tool_step(run(tool_status="completed"), "end_meeting_recording", completed=False)
