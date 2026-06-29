from collections.abc import Callable
from app.common.schemas.public_contracts import AgentJobMessage, AgentResultMessage

WorkflowInput = AgentJobMessage
WorkflowOutput = AgentResultMessage
WorkflowHandler = Callable[[WorkflowInput], WorkflowOutput]

_workflow_registry: dict[str, WorkflowHandler] = {}


def register_workflow(workflow_type: str, handler: WorkflowHandler) -> None:
    _workflow_registry[workflow_type] = handler


def get_workflow(workflow_type: str) -> WorkflowHandler:
    try:
        return _workflow_registry[workflow_type]
    except KeyError as exc:
        raise NotImplementedError(
            f"Workflow {workflow_type} is reserved by contract but not registered."
        ) from exc
