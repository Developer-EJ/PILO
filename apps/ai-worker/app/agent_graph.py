from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Literal, Protocol, TypedDict
from uuid import UUID

from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime

AgentGraphRoute = Literal[
    "terminal",
    "waiting_confirmation",
    "waiting_user_input",
    "running",
    "unsupported_status",
    "planner_turn_limit",
    "planning",
]


class AgentGraphResult(Protocol):
    delete_message: bool
    reason: str
    run_id: str | None


class AgentGraphState(TypedDict):
    thread_id: str
    invocation_id: str
    run_status: str
    planner_turn_count: int
    planning_context: str
    active_goal: str | None
    pending_confirmation: bool
    delete_message: bool
    result_reason: str
    result_run_id: str | None


@dataclass(frozen=True)
class AgentGraphRuntime:
    handlers: Mapping[AgentGraphRoute, Callable[[], AgentGraphResult]]


def build_agent_run_graph(checkpointer: object | None = None):
    builder = StateGraph(AgentGraphState, context_schema=AgentGraphRuntime)

    for route in (
        "terminal",
        "waiting_confirmation",
        "waiting_user_input",
        "running",
        "unsupported_status",
        "planner_turn_limit",
        "planning",
    ):
        builder.add_node(route, _run_handler(route))
        builder.add_edge(route, END)

    builder.add_conditional_edges(START, _route_agent_run)
    return builder.compile(checkpointer=checkpointer)


def agent_graph_config(thread_id: str | None, invocation_id: str) -> dict[str, object]:
    return {
        "run_id": UUID(invocation_id),
        "configurable": {"thread_id": thread_id or invocation_id},
    }


def _route_agent_run(state: AgentGraphState) -> AgentGraphRoute:
    status = state["run_status"]
    if status in {"completed", "failed", "cancelled"}:
        return "terminal"
    if status == "waiting_confirmation":
        return "waiting_confirmation"
    if status == "waiting_user_input":
        return "waiting_user_input"
    if status == "running":
        return "running"
    if status != "planning":
        return "unsupported_status"
    if state["planner_turn_count"] >= 5:
        return "planner_turn_limit"
    return "planning"


def _run_handler(
    route: AgentGraphRoute,
) -> Callable[[AgentGraphState, Runtime[AgentGraphRuntime]], dict[str, object]]:
    def handler(
        _state: AgentGraphState,
        runtime: Runtime[AgentGraphRuntime],
    ) -> dict[str, object]:
        result = runtime.context.handlers[route]()
        return {
            "delete_message": result.delete_message,
            "result_reason": result.reason,
            "result_run_id": result.run_id,
        }

    return handler
