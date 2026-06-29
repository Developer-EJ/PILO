from app.common.schemas.public_contracts import AgentAction, AgentActionType
from app.workflows.github.actions import ACTION_OWNER_BY_TYPE as GITHUB_ACTIONS
from app.workflows.meeting.actions import ACTION_OWNER_BY_TYPE as MEETING_ACTIONS
from app.workflows.planning.actions import ACTION_OWNER_BY_TYPE as PLANNING_ACTIONS
from app.workflows.review.actions import ACTION_OWNER_BY_TYPE as REVIEW_ACTIONS
from app.workflows.task.actions import ACTION_OWNER_BY_TYPE as TASK_ACTIONS
from .contract_validation import validate_agent_action

ACTION_OWNER_MAPS = (
    TASK_ACTIONS,
    GITHUB_ACTIONS,
    MEETING_ACTIONS,
    REVIEW_ACTIONS,
    PLANNING_ACTIONS,
)

ACTION_OWNER_MAP: dict[AgentActionType, str] = {}
for action_owner_map in ACTION_OWNER_MAPS:
    ACTION_OWNER_MAP.update(action_owner_map)


def route_action(action: AgentAction) -> str:
    validate_agent_action(action)
    return ACTION_OWNER_MAP[action["type"]]
