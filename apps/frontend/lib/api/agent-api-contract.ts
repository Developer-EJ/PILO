import type {
  AgentActionPage,
  PaginationQuery,
} from "../types/public-contracts";

export interface AgentApiContract {
  listAgentActions(
    workspaceId: string,
    pagination?: PaginationQuery,
  ): Promise<AgentActionPage>;
}
