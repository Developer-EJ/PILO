from .registry import WorkflowInput, WorkflowOutput, get_workflow
from .contract_validation import (
    validate_agent_job_message,
    validate_agent_result_message,
)


def run_workflow(
    workflow_type: str,
    input_data: WorkflowInput,
) -> WorkflowOutput:
    validate_agent_job_message(input_data)
    result = get_workflow(workflow_type)(input_data)
    validate_agent_result_message(result)
    return result
