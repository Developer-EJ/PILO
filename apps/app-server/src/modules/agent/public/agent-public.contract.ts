import {
  AgentActionPage,
  PaginationQuery,
} from "../../../common/contracts/public-contracts";

export interface AgentPublicContract {
  listAgentActions(
    workspaceId: string,
    pagination?: PaginationQuery,
  ): Promise<AgentActionPage>;
}
