from app.workflows.review import run_review_analysis_workflow


def test_review_workflow_returns_deterministic_payload() -> None:
    output = run_review_analysis_workflow(
        {
            "pullRequestId": "66666666-6666-4666-8666-666666666661",
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
    assert output["questions"][0]["priority"] == "medium"
    assert output["checklist"][-1]["type"] == "merge"


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
