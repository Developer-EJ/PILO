from app.workflows.review import run_review_analysis_workflow


def test_review_workflow_returns_deterministic_payload() -> None:
    output = run_review_analysis_workflow(
        {
            "pullRequestId": "66666666-6666-4666-8666-666666666661",
            "requestedAt": "2026-06-27T10:00:00+00:00",
            "pullRequestSummary": {
                "id": "66666666-6666-4666-8666-666666666661",
                "title": "Add OAuth callback shell",
                "branch": "feature/donghyun/auth-login",
            },
            "changedFiles": [
                {
                    "id": "88888888-8888-4888-8888-8888888888b1",
                    "filePath": "apps/frontend/app/auth/callback/page.tsx",
                    "additions": 42,
                    "deletions": 8,
                    "summary": "OAuth callback route shell",
                    "functions": [{"name": "AuthCallbackPage"}],
                }
            ],
        }
    )

    assert output["pullRequestId"] == "66666666-6666-4666-8666-666666666661"
    assert output["riskLevel"] == "medium"
    assert output["graph"]["reviewOrder"] == [
        "review-node-file-1",
        "review-node-function-2",
    ]
    assert output["graph"]["intentSummary"]
    assert output["graph"]["nodes"][0]["reviewOrder"] == 1
    assert output["graph"]["nodes"][0]["position"] == {"x": 84, "y": 72}
    assert output["graph"]["nodes"][0]["detail"]["changeGroups"][0]["newStartLine"] == 1
    assert output["questions"][0]["priority"] == "medium"
    assert output["checklist"][-1]["type"] == "merge"
    assert "redirect" not in output["testRecommendation"]
    assert output["generatedAt"] == "2026-06-27T10:00:00+00:00"


def test_review_workflow_strips_secret_like_fields() -> None:
    output = run_review_analysis_workflow(
        {
            "pullRequestId": "pr-1",
            "pullRequestSummary": {
                "id": "pr-1",
                "title": "Safe PR",
                "branch": "feature/safe",
                "accessToken": "never-return",
            },
            "changedFiles": [
                {
                    "id": "file-1",
                    "filePath": "README.md",
                    "additions": 1,
                    "deletions": 0,
                    "privateKey": "never-return",
                }
            ],
        }
    )

    assert "never-return" not in str(output)
    assert output["riskLevel"] == "low"
    assert output["generatedAt"] == "1970-01-01T00:00:00+00:00"


def test_review_workflow_requires_pull_request_title() -> None:
    try:
        run_review_analysis_workflow(
            {
                "pullRequestId": "pr-1",
                "pullRequestSummary": {"id": "pr-1"},
                "changedFiles": [],
            }
        )
    except ValueError as error:
        assert "pullRequestSummary.title is required" in str(error)
    else:
        raise AssertionError("expected ValueError")


def test_review_workflow_rejects_mismatched_pull_request_id() -> None:
    try:
        run_review_analysis_workflow(
            {
                "pullRequestId": "pr-1",
                "pullRequestSummary": {"id": "pr-2", "title": "Mismatch"},
                "changedFiles": [],
            }
        )
    except ValueError as error:
        assert "pullRequestId must match pullRequestSummary.id" in str(error)
    else:
        raise AssertionError("expected ValueError")
