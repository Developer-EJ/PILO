from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["service"] == "ai-worker"
    assert response.json()["status"] == "ok"


def test_review_workflow_endpoint_returns_deterministic_payload() -> None:
    response = client.post(
        "/workflows/review/run",
        json={
            "pullRequestId": "66666666-6666-4666-8666-666666666661",
            "requestedAt": "2026-06-27T10:00:00+00:00",
            "pullRequestSummary": {
                "id": "66666666-6666-4666-8666-666666666661",
                "title": "Add OAuth callback shell",
                "branch": "feature/donghyun/auth-login",
                "accessToken": "never-return",
            },
            "changedFiles": [
                {
                    "id": "88888888-8888-4888-8888-8888888888b1",
                    "filePath": "apps/frontend/app/auth/callback/page.tsx",
                    "additions": 42,
                    "deletions": 8,
                    "summary": "OAuth callback route shell",
                    "functions": [{"name": "AuthCallbackPage"}],
                    "privateKey": "never-return",
                }
            ],
        },
    )

    output = response.json()

    assert response.status_code == 200
    assert output["pullRequestId"] == "66666666-6666-4666-8666-666666666661"
    assert output["riskLevel"] == "medium"
    assert output["graph"]["reviewOrder"] == [
        "review-node-file-1",
        "review-node-function-2",
    ]
    assert output["generatedAt"] == "2026-06-27T10:00:00+00:00"
    assert "never-return" not in str(output)


def test_review_workflow_endpoint_returns_400_for_invalid_payload() -> None:
    response = client.post(
        "/workflows/review/run",
        json={
            "pullRequestId": "pr-1",
            "pullRequestSummary": {"id": "pr-1"},
            "changedFiles": [],
        },
    )

    assert response.status_code == 400
    assert "pullRequestSummary.title is required" in response.json()["detail"]
