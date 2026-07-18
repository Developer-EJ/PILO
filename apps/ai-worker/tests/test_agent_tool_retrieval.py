import pytest

from app.agent_tool_retrieval import (
    parse_tool_capability_catalog,
    retrieve_tool_shortlist,
)


def catalog_payload() -> dict[str, object]:
    return {
        "version": "agent-tool-capabilities:v1",
        "sha256": "a" * 64,
        "descriptors": [
            {
                "toolName": "list_calendar_events",
                "domain": "calendar",
                "action": "list_calendar_events",
                "capabilityIds": ["calendar.list"],
                "whenToUse": "이번 주 일정과 Calendar event를 조회합니다.",
                "mustNotUseFor": ["회의록 요청"],
                "acceptedSelectorFields": ["start", "end"],
                "prerequisiteToolNames": [],
                "followUpToolNames": [],
                "riskLevel": "low",
                "executionMode": "auto",
                "contextSurface": None,
            },
            {
                "toolName": "list_meeting_reports",
                "domain": "meeting",
                "action": "list_meeting_reports",
                "capabilityIds": ["meeting.reports.list"],
                "whenToUse": "회의록과 미팅 report 목록을 조회합니다.",
                "mustNotUseFor": ["일정 요청"],
                "acceptedSelectorFields": ["status", "limit"],
                "prerequisiteToolNames": [],
                "followUpToolNames": [],
                "riskLevel": "low",
                "executionMode": "auto",
                "contextSurface": None,
            },
        ],
    }


def test_catalog_requires_exactly_the_hard_eligible_tools() -> None:
    catalog = parse_tool_capability_catalog(
        catalog_payload(), {"list_calendar_events", "list_meeting_reports"}
    )

    assert catalog is not None
    assert catalog.version == "agent-tool-capabilities:v1"

    invalid = catalog_payload()
    invalid["descriptors"] = invalid["descriptors"][:1]
    with pytest.raises(ValueError, match="toolCapabilityCatalog"):
        parse_tool_capability_catalog(invalid, {"list_calendar_events", "list_meeting_reports"})


def test_metadata_retrieval_prefers_matching_domain_and_returns_low_confidence_fallback() -> None:
    catalog = parse_tool_capability_catalog(
        catalog_payload(), {"list_calendar_events", "list_meeting_reports"}
    )
    assert catalog is not None

    calendar = retrieve_tool_shortlist("이번 주 일정 알려줘", catalog, top_k=1)
    assert calendar.tool_names == ("list_calendar_events",)
    assert not calendar.low_confidence

    unknown = retrieve_tool_shortlist("점심 메뉴 추천해줘", catalog)
    assert unknown.tool_names == ()
    assert unknown.low_confidence
    assert unknown.fallback_reason == "no_metadata_match"
