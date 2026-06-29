from __future__ import annotations

from typing import Any

SECRET_KEYS = {
    "accessToken",
    "access_token",
    "authorization",
    "clientSecret",
    "client_secret",
    "oauthToken",
    "oauth_token",
    "privateKey",
    "private_key",
    "refreshToken",
    "refresh_token",
    "secret",
    "token",
}


def run_review_analysis_workflow(payload: dict[str, Any]) -> dict[str, Any]:
    pull_request = _sanitize(payload.get("pullRequestSummary", {}))
    changed_files = [_sanitize(file) for file in payload.get("changedFiles", [])]
    pull_request_id = _required_text(
        payload.get("pullRequestId") or pull_request.get("id"),
        "pullRequestId",
    )
    summary_pull_request_id = pull_request.get("id")
    if summary_pull_request_id and summary_pull_request_id != pull_request_id:
        raise ValueError("pullRequestId must match pullRequestSummary.id")

    risky_files = [
        file
        for file in changed_files
        if int(file.get("additions", 0)) + int(file.get("deletions", 0)) >= 30
    ]
    risk_level = "medium" if risky_files else "low"
    title = _required_text(pull_request.get("title"), "pullRequestSummary.title")

    nodes = _build_graph_nodes(changed_files)

    return {
        "pullRequestId": pull_request_id,
        "purposeSummary": f"{title} 변경 의도를 요약했다.",
        "impactSummary": _impact_summary(pull_request, changed_files),
        "testRecommendation": _test_recommendation(risky_files),
        "riskLevel": risk_level,
        "checklist": _build_checklist(risk_level),
        "questions": _build_questions(risky_files),
        "graph": {
            "summary": f"{len(changed_files)}개 변경 파일 기준 review canvas",
            "intentSummary": f"{title} PR의 핵심 변경 흐름을 리뷰 순서로 정리했다.",
            "reviewStrategy": "파일 진입점, 변경 함수, 영향 범위 순서로 확인한다.",
            "reviewOrder": [node["id"] for node in nodes],
            "nodes": nodes,
        },
        "generatedAt": _generated_at(payload),
    }


def _build_graph_nodes(changed_files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []

    for index, file in enumerate(changed_files, start=1):
        file_path = _required_text(file.get("filePath"), "changedFiles.filePath")
        file_id = _required_text(file.get("id"), "changedFiles.id")
        additions = int(file.get("additions", 0))
        deletions = int(file.get("deletions", 0))
        risk_level = "medium" if additions + deletions >= 30 else "low"
        nodes.append(
            {
                "id": f"review-node-file-{index}",
                "changedFileId": file_id,
                "nodeType": "file",
                "label": file_path,
                "filePath": file_path,
                "functionName": None,
                "riskLevel": risk_level,
                "status": "discuss" if risk_level == "medium" else "unknown",
                "reviewOrder": len(nodes) + 1,
                "roleSummary": file.get("summary") or "변경 파일의 역할을 확인한다.",
                "reviewReason": file.get("summary") or "변경 파일 검토가 필요하다.",
                "position": {"x": 84 + (index - 1) * 280, "y": 72},
                "detail": _node_detail(file_path, file, "file"),
            }
        )

        for function in file.get("functions", []):
            nodes.append(
                {
                    "id": f"review-node-function-{len(nodes) + 1}",
                    "changedFileId": file_id,
                    "nodeType": "function",
                    "label": function.get("name", "unknown"),
                    "filePath": file_path,
                    "functionName": function.get("name"),
                    "riskLevel": risk_level,
                    "status": "unknown",
                    "reviewOrder": len(nodes) + 1,
                    "roleSummary": function.get("summary")
                    or "변경 함수의 역할을 확인한다.",
                    "reviewReason": function.get("summary")
                    or "변경 함수 검토가 필요하다.",
                    "position": {"x": 84 + (index - 1) * 280, "y": 190},
                    "detail": _node_detail(file_path, function, "function"),
                }
            )

    return nodes


def _build_checklist(risk_level: str) -> list[dict[str, str]]:
    checklist = [
        {"type": "review", "title": "변경 파일 요약과 실제 diff를 대조한다."},
        {"type": "review", "title": "영향 범위가 연결 Task와 맞는지 확인한다."},
    ]

    if risk_level != "low":
        checklist.append(
            {"type": "merge", "title": "주요 회귀 smoke test 결과를 확인한다."}
        )

    return checklist


def _build_questions(risky_files: list[dict[str, Any]]) -> list[dict[str, str]]:
    if not risky_files:
        return []

    return [
        {
            "priority": "medium",
            "question": f"{_required_text(file.get('filePath'), 'filePath')} 변경의 실패 케이스가 테스트되었나요?",
        }
        for file in risky_files
    ]


def _impact_summary(
    pull_request: dict[str, Any],
    changed_files: list[dict[str, Any]],
) -> str:
    branch = pull_request.get("branch", "unknown branch")
    changed_count = len(changed_files)
    return f"{branch} 브랜치의 {changed_count}개 파일 변경이 review 대상이다."


def _test_recommendation(risky_files: list[dict[str, Any]]) -> str:
    if risky_files:
        return "변경량이 큰 파일을 중심으로 회귀 smoke test와 실패 경로를 확인한다."

    return "주요 변경 파일의 happy path smoke test를 확인한다."


def _node_detail(
    file_path: str, source: dict[str, Any], node_kind: str
) -> dict[str, Any]:
    summary = source.get("summary") or f"{node_kind} 변경 내용을 확인한다."
    return {
        "filePath": file_path,
        "modificationReason": summary,
        "changeGroups": [
            {
                "id": f"{node_kind}-change",
                "title": summary,
                "summary": summary,
                "newStartLine": int(source.get("newStartLine", 1)),
                "newEndLine": int(
                    source.get("newEndLine", source.get("newStartLine", 1))
                ),
            }
        ],
        "diffHunks": [
            {
                "id": f"{node_kind}-diff",
                "oldStartLine": int(source.get("oldStartLine", 1)),
                "newStartLine": int(source.get("newStartLine", 1)),
                "oldCode": str(source.get("oldCode", "")),
                "newCode": str(source.get("newCode", "")),
            }
        ],
    }


def _generated_at(payload: dict[str, Any]) -> str:
    requested_at = payload.get("requestedAt")
    if isinstance(requested_at, str) and requested_at:
        return requested_at

    return "1970-01-01T00:00:00+00:00"


def _sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _sanitize(child)
            for key, child in value.items()
            if key not in SECRET_KEYS
        }

    if isinstance(value, list):
        return [_sanitize(child) for child in value]

    return value


def _required_text(value: Any, field: str) -> str:
    if isinstance(value, str) and value:
        return value

    raise ValueError(f"{field} is required")
