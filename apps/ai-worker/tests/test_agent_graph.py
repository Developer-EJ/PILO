from langgraph.checkpoint.memory import InMemorySaver

from app.agent_graph import AgentGraphRuntime, agent_graph_config, build_agent_run_graph
from app.agent_processor import AgentProcessResult


def _runtime(reason: str) -> AgentGraphRuntime:
    result = AgentProcessResult(delete_message=True, reason=reason, run_id="run-result")
    return AgentGraphRuntime(
        handlers={
            "terminal": lambda: result,
            "waiting_confirmation": lambda: result,
            "waiting_user_input": lambda: result,
            "running": lambda: result,
            "unsupported_status": lambda: result,
            "planner_turn_limit": lambda: result,
            "planning": lambda: result,
        }
    )


def _state(*, invocation_id: str, status: str = "planning") -> dict[str, object]:
    return {
        "thread_id": "11111111-1111-4111-8111-111111111111",
        "invocation_id": invocation_id,
        "run_status": status,
        "planner_turn_count": 0,
        "planning_context": "user: 그 회의록의 결정사항은?",
        "active_goal": None,
        "pending_confirmation": False,
        "delete_message": True,
        "result_reason": "",
        "result_run_id": invocation_id,
    }


def test_graph_routes_single_turn_planning() -> None:
    graph = build_agent_run_graph()
    run_id = "22222222-2222-4222-8222-222222222222"

    result = graph.invoke(
        _state(invocation_id=run_id),
        config=agent_graph_config(None, run_id),
        context=_runtime("planned"),
    )

    assert result["result_reason"] == "planned"
    assert result["invocation_id"] == run_id


def test_graph_checkpointer_reuses_agent_thread_across_distinct_runs() -> None:
    checkpointer = InMemorySaver()
    graph = build_agent_run_graph(checkpointer)
    thread_id = "11111111-1111-4111-8111-111111111111"
    first_run_id = "22222222-2222-4222-8222-222222222222"
    second_run_id = "33333333-3333-4333-8333-333333333333"

    graph.invoke(
        _state(invocation_id=first_run_id),
        config=agent_graph_config(thread_id, first_run_id),
        context=_runtime("first_planned"),
    )
    graph.invoke(
        _state(invocation_id=second_run_id),
        config=agent_graph_config(thread_id, second_run_id),
        context=_runtime("second_planned"),
    )

    snapshot = graph.get_state({"configurable": {"thread_id": thread_id}})
    invocation_ids = {
        item.values["invocation_id"]
        for item in graph.get_state_history({"configurable": {"thread_id": thread_id}})
        if item.values.get("invocation_id")
    }
    assert snapshot.values["invocation_id"] == second_run_id
    assert invocation_ids == {first_run_id, second_run_id}


def test_graph_routes_waiting_confirmation_without_planning() -> None:
    graph = build_agent_run_graph()
    run_id = "22222222-2222-4222-8222-222222222222"

    result = graph.invoke(
        _state(invocation_id=run_id, status="waiting_confirmation"),
        config=agent_graph_config(None, run_id),
        context=_runtime("waiting_confirmation"),
    )

    assert result["result_reason"] == "waiting_confirmation"
