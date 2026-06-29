from app.common.schemas.public_contracts import AgentActionType

ACTION_OWNER_BY_TYPE: dict[AgentActionType, str] = {
    "review.analysis.generate": "review",
}
