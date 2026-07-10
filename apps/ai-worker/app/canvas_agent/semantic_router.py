from __future__ import annotations

from typing import Protocol, TypeVar

from app.canvas_agent.embeddings import CanvasEmbedder, CanvasEmbeddingError
from app.canvas_agent.types import (
    CanvasAgentPlan,
    CanvasAgentRunContext,
    CanvasSemanticShapeMatch,
)


class SemanticCanvasAgentRepository(Protocol):
    def search_semantic_shapes(
        self,
        workspace_id: str,
        canvas_id: str,
        query_embedding: list[float],
        limit: int = 4,
    ) -> list[CanvasSemanticShapeMatch]: ...


class CanvasSemanticRouter:
    def __init__(
        self,
        repository: SemanticCanvasAgentRepository,
        embedder: CanvasEmbedder,
        *,
        shape_similarity_min: float = 0.78,
        similarity_margin_min: float = 0.08,
    ) -> None:
        self.repository = repository
        self.embedder = embedder
        self.shape_similarity_min = shape_similarity_min
        self.similarity_margin_min = similarity_margin_min

    @property
    def model(self) -> str:
        return f"local:{self.embedder.model_name}@{self.embedder.model_version}"

    def plan(self, context: CanvasAgentRunContext) -> CanvasAgentPlan | None:
        request = _semantic_request(context)
        if request is None:
            return None
        query = request

        try:
            query_embedding = self.embedder.embed_query(query)
        except CanvasEmbeddingError:
            return None

        shape_matches = self.repository.search_semantic_shapes(
            context.workspace_id,
            context.canvas_id,
            query_embedding,
        )
        shape_match = _confident(
            shape_matches,
            self.shape_similarity_min,
            self.similarity_margin_min,
        )

        if isinstance(shape_match, CanvasSemanticShapeMatch):
            shape_ids = [match.shape_id for match in shape_matches[:4]]
            return CanvasAgentPlan(
                action_name="find_shapes",
                input={
                    "query": query,
                    "shapeIds": shape_ids,
                    "continuePlanning": False,
                    "focusResult": _requests_focus(context.prompt),
                },
                message=f"“{query}”와 의미가 가까운 도형을 찾았습니다.",
            )

        return None


def _semantic_request(context: CanvasAgentRunContext) -> str | None:
    previous = context.previous_action
    if previous is None:
        return None
    if previous.get("actionName") != "find_shapes":
        return None
    resource_refs = previous.get("resourceRefs")
    if isinstance(resource_refs, list) and any(
        isinstance(value, str) and value for value in resource_refs
    ):
        return None
    action_input = previous.get("input")
    if not isinstance(action_input, dict):
        return None
    query = action_input.get("query")
    if not isinstance(query, str):
        return None
    normalized = query.strip()
    return normalized[:120] if normalized else None


T = TypeVar("T")


def _confident(
    matches: list[T],
    similarity_min: float,
    margin_min: float,
) -> T | None:
    if not matches:
        return None
    top = matches[0]
    top_similarity = getattr(top, "similarity", 0.0)
    if top_similarity < similarity_min:
        return None
    if len(matches) > 1:
        next_similarity = getattr(matches[1], "similarity", 0.0)
        if top_similarity - next_similarity < margin_min:
            return None
    return top


def _requests_focus(prompt: str) -> bool:
    return any(keyword in prompt for keyword in ("어디", "위치", "이동", "가줘", "보여"))
