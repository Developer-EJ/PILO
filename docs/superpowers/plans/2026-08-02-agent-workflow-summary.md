# Agent Workflow Evaluation Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the 31-scenario Agent workflow snapshot option and publish evaluation metrics in the GitHub Actions run summary.

**Architecture:** Extend the existing snapshot CLI with a pure Markdown renderer that supports both snapshot formats and an optional summary output path. Add a workflow input that selects the snapshot scope, conditionally prepares its inputs, and feeds the selected report through the same JSON snapshot and Summary path.

**Tech Stack:** Python 3.12, pytest, GitHub Actions YAML, `$GITHUB_STEP_SUMMARY`

## Global Constraints

- Preserve `multi_turn_context` as the default snapshot scope.
- Keep compare mode limited to the current multi-turn comparison.
- Do not introduce a quality threshold or change workflow success based on measured scores.
- Preserve JSON artifacts with 30-day retention.

---

### Task 1: Markdown Summary Renderer

**Files:**
- Modify: `apps/ai-worker/scripts/snapshot_agent_planner_evaluations.py`
- Modify: `apps/ai-worker/tests/test_agent_planner_comparison.py`

**Interfaces:**
- Consumes: snapshot dictionaries from `build_agent_performance_snapshot(...)` or `build_multiturn_context_snapshot(...)`
- Produces: `render_snapshot_summary(snapshot: dict[str, object]) -> str` and CLI option `--summary-output Path`

- [ ] **Step 1: Write failing renderer tests**

Add tests that assert the workflow snapshot Markdown contains `19 / 155`, `12.26%`, `73.55%`, `43.87%`, and safety violations, and that the multi-turn snapshot contains its conversation count and context metrics. Add an unsupported-format test expecting `ValueError`.

- [ ] **Step 2: Run tests to verify RED**

Run: `python -m pytest -q apps/ai-worker/tests/test_agent_planner_comparison.py -k "snapshot_summary"`

Expected: FAIL because `render_snapshot_summary` does not exist.

- [ ] **Step 3: Implement minimal Markdown rendering**

Render percent values with two decimal places and integer counts without changing the snapshot. Add `--summary-output`; when provided, write the Markdown with a trailing newline.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `python -m pytest -q apps/ai-worker/tests/test_agent_planner_comparison.py -k "snapshot_summary or snapshot_cli"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ai-worker/scripts/snapshot_agent_planner_evaluations.py apps/ai-worker/tests/test_agent_planner_comparison.py
git commit -m "feat(ci): Agent 평가 Summary 렌더링"
```

### Task 2: Snapshot Scope Workflow Integration

**Files:**
- Modify: `.github/workflows/evaluate-agent-planner.yml`
- Modify: `apps/ai-worker/tests/test_agent_planner_workflow.py`

**Interfaces:**
- Consumes: workflow input `snapshot_scope` with values `multi_turn_context` or `agent_workflow`
- Produces: selected evaluation report, JSON snapshot, and Markdown at `$GITHUB_STEP_SUMMARY`

- [ ] **Step 1: Write failing workflow contract test**

Assert that the workflow declares `snapshot_scope`, keeps `multi_turn_context` as default, selects `agent_workflow` when requested, conditionally downloads private multi-turn inputs, passes `--workflow-catalog` only for workflow evaluation, uses dynamic report names, and invokes `--summary-output "$GITHUB_STEP_SUMMARY"`.

- [ ] **Step 2: Run test to verify RED**

Run: `python -m pytest -q apps/ai-worker/tests/test_agent_planner_workflow.py -k "snapshot_scope or summary"`

Expected: FAIL because the workflow has no scope input or Summary output.

- [ ] **Step 3: Implement workflow selection and Summary publishing**

Add the input, copy `agent_workflow_catalog_v1.json`, condition the private S3 download on `matrix.variant == 'multi_turn_context'`, construct evaluator arguments for the selected variant, download the selected snapshot artifact, and pass `$GITHUB_STEP_SUMMARY` to the renderer.

- [ ] **Step 4: Run targeted and full verification**

Run: `python -m pytest -q apps/ai-worker/tests/test_agent_planner_workflow.py apps/ai-worker/tests/test_agent_planner_comparison.py`

Run: `python -m ruff check apps/ai-worker/scripts/snapshot_agent_planner_evaluations.py apps/ai-worker/tests/test_agent_planner_comparison.py apps/ai-worker/tests/test_agent_planner_workflow.py`

Run: `git diff --check`

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/evaluate-agent-planner.yml apps/ai-worker/tests/test_agent_planner_workflow.py docs/superpowers/plans/2026-08-02-agent-workflow-summary.md
git commit -m "ci: Agent workflow 평가 Summary 공개"
```
