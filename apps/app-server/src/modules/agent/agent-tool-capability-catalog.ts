import { createHash } from "node:crypto";
import type { AgentToolDefinition } from "./types/agent-tool.types";

export const AGENT_TOOL_CAPABILITY_CATALOG_VERSION =
  "agent-tool-capabilities:v1";

export interface AgentToolCapabilityDescriptor {
  toolName: string;
  domain: string;
  action: string;
  capabilityIds: string[];
  whenToUse: string;
  mustNotUseFor: string[];
  acceptedSelectorFields: string[];
  prerequisiteToolNames: string[];
  followUpToolNames: string[];
  riskLevel: AgentToolDefinition<unknown>["riskLevel"];
  executionMode: AgentToolDefinition<unknown>["executionMode"];
  contextSurface: string | null;
}

export interface AgentToolCapabilityCatalogSnapshot {
  version: string;
  sha256: string;
  descriptors: AgentToolCapabilityDescriptor[];
}

const TOOL_DOMAIN_BY_NAME: Readonly<Record<string, string>> = {
  approve_meeting_report_action_item: "meeting",
  assign_board_issue_safely: "board",
  create_board_issue: "board",
  create_calendar_event: "calendar",
  delegate_canvas_agent: "canvas",
  diagnose_board_freshness: "board",
  dismiss_meeting_report_action_item: "meeting",
  end_meeting_recording: "meeting",
  find_action_items: "meeting",
  focus_sql_erd_tables: "sql_erd",
  generate_sql_erd: "sql_erd",
  get_active_meeting: "meeting",
  get_board_briefing: "board",
  get_board_issue_context: "board",
  get_meeting_decision_evidence: "meeting",
  get_meeting_participants: "meeting",
  get_meeting_report: "meeting",
  inspect_sql_erd_schema: "sql_erd",
  join_meeting: "meeting",
  leave_meeting: "meeting",
  list_calendar_events: "calendar",
  list_meeting_reports: "meeting",
  list_meeting_rooms: "meeting",
  move_board_issue_status: "board",
  recommend_pr_review_focus: "pr_review",
  regenerate_meeting_report: "meeting",
  resolve_board_context: "board",
  resolve_meeting_resource: "meeting",
  search_board_issues: "board",
  search_meeting_transcript: "meeting",
  search_workspace_documents: "drive",
  start_meeting_in_room: "meeting",
  start_meeting_recording: "meeting",
  summarize_meeting_report: "meeting",
  update_calendar_event: "calendar",
  update_meeting_report_action_item: "meeting"
};

export function buildAgentToolCapabilityCatalog(
  definitions: AgentToolDefinition<unknown>[]
): AgentToolCapabilityCatalogSnapshot {
  const descriptors = definitions
    .map((definition) => toDescriptor(definition))
    .sort((left, right) => left.toolName.localeCompare(right.toolName));
  const canonical = JSON.stringify({
    version: AGENT_TOOL_CAPABILITY_CATALOG_VERSION,
    descriptors
  });

  return {
    version: AGENT_TOOL_CAPABILITY_CATALOG_VERSION,
    sha256: createHash("sha256").update(canonical).digest("hex"),
    descriptors
  };
}

function toDescriptor(
  definition: AgentToolDefinition<unknown>
): AgentToolCapabilityDescriptor {
  const domain = TOOL_DOMAIN_BY_NAME[definition.name];
  if (!domain) {
    throw new Error(
      `Agent tool capability descriptor is missing for ${definition.name}`
    );
  }

  return {
    toolName: definition.name,
    domain,
    action: definition.name,
    capabilityIds: [`${domain}.${definition.name}`],
    whenToUse: definition.description,
    mustNotUseFor: [`${domain} 이외 도메인의 요청`],
    acceptedSelectorFields: Object.keys(
      (definition.inputSchema.properties as Record<string, unknown> | undefined) ?? {}
    ).sort(),
    prerequisiteToolNames: [],
    followUpToolNames: [],
    riskLevel: definition.riskLevel,
    executionMode: definition.executionMode,
    contextSurface: definition.contextRequirement?.surface ?? null
  };
}
