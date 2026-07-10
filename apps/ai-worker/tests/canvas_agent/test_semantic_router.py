from __future__ import annotations

from app.canvas_agent.semantic_router import CanvasSemanticRouter
from app.canvas_agent.types import (
    CanvasAgentRunContext,
    CanvasSemanticShapeMatch,
)


class FakeEmbedder:
    model_name = "test-embedding"
    model_version = "test-revision"

    def embed_query(self, text: str) -> list[float]:
        assert text == "인증 흐름"
        return [0.1] * 384

    def embed_passage(self, _text: str) -> list[float]:
        raise AssertionError("semantic routing only embeds a query")


class FakeRepository:
    def __init__(self, *, shapes=None) -> None:
        self.shapes = shapes or []

    def search_semantic_shapes(self, _workspace_id, _canvas_id, _embedding, limit=4):
        assert limit == 4
        return self.shapes


def unmatched_find_context() -> CanvasAgentRunContext:
    return CanvasAgentRunContext(
        run_id="run-1",
        workspace_id="workspace-1",
        canvas_id="canvas-1",
        requested_by_user_id="user-1",
        status="planning",
        prompt="인증 흐름 있는 곳으로 가줘",
        request_context={"selectedShapeIds": []},
        previous_action={
            "actionName": "find_shapes",
            "input": {"query": "인증 흐름"},
            "output": {},
            "resourceRefs": [],
        },
    )


def test_semantic_router_uses_confident_canvas_shape_match() -> None:
    repository = FakeRepository(
        shapes=[
            CanvasSemanticShapeMatch("shape:auth", 0.91),
            CanvasSemanticShapeMatch("shape:login", 0.7),
        ]
    )

    plan = CanvasSemanticRouter(repository, FakeEmbedder()).plan(unmatched_find_context())

    assert plan is not None
    assert plan.action_name == "find_shapes"
    assert plan.input["shapeIds"] == ["shape:auth", "shape:login"]
    assert plan.input["focusResult"] is True


def test_semantic_router_skips_direct_prompt_without_unmatched_shape_search() -> None:
    repository = FakeRepository(shapes=[CanvasSemanticShapeMatch("shape:auth", 0.91)])
    context = CanvasAgentRunContext(
        run_id="run-1",
        workspace_id="workspace-1",
        canvas_id="canvas-1",
        requested_by_user_id="user-1",
        status="planning",
        prompt="인증 흐름을 다이어그램으로 만들어줘",
        request_context={"selectedShapeIds": []},
        previous_action=None,
    )

    plan = CanvasSemanticRouter(repository, FakeEmbedder()).plan(context)

    assert plan is None
