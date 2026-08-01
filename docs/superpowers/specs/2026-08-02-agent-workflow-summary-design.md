# Agent Workflow Evaluation Summary Design

## Goal

Allow the existing `Evaluate Agent Router and Planner` workflow to run either the current Korean multi-turn evaluation or the 31-scenario Agent workflow evaluation, and publish the resulting quality metrics in the GitHub Actions run summary.

## Scope

- Add a `snapshot_scope` workflow input with `multi_turn_context` as the existing default and `agent_workflow` as the additional option.
- Keep compare mode limited to the existing multi-turn comparison.
- Download private multi-turn inputs only for the multi-turn scope.
- Prepare and pass the 31-scenario workflow catalog only for the Agent workflow scope.
- Build the existing JSON snapshot for either scope and render a Markdown table to `$GITHUB_STEP_SUMMARY`.
- Do not add a quality threshold or change the workflow conclusion based on measured scores.

## Summary Contents

The Agent workflow summary shows revision, scenario and attempt counts, task success, execution-contract pass rate, Tool selection accuracy, required-input accuracy, safety violations, and mean latency. The multi-turn summary shows its conversation count and existing context, Tool selection, partial, and inconclusive rates.

## Failure Handling

Malformed or unsupported snapshot data fails the summary step instead of publishing misleading values. The JSON artifact remains the source of truth and keeps the existing 30-day retention.

## Verification

- Unit tests cover Markdown rendering for both snapshot formats and unsupported input.
- Workflow contract tests verify scope selection, conditional inputs, dynamic artifact paths, and `$GITHUB_STEP_SUMMARY` publishing.
- Existing Agent comparison and workflow tests remain green.
