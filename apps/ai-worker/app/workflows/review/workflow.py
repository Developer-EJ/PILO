from .schemas import ReviewAnalysisWorkflowInput, ReviewAnalysisWorkflowOutput


def run_review_analysis_workflow(
    input_data: ReviewAnalysisWorkflowInput,
) -> ReviewAnalysisWorkflowOutput:
    raise NotImplementedError("Review analysis workflow is reserved by contract.")
