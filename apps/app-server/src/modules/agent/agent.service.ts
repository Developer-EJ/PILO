import { Injectable } from "@nestjs/common";
import {
  AgentActionPage,
  NotImplementedError,
  PaginationQuery,
} from "../../common/contracts/public-contracts";
import { AgentPublicContract } from "./public/agent-public.contract";

@Injectable()
export class AgentService implements AgentPublicContract {
  listAgentActions(
    workspaceId: string,
    pagination?: PaginationQuery,
  ): Promise<AgentActionPage> {
    void workspaceId;
    void pagination;
    throw new NotImplementedError("AgentPublicContract.listAgentActions");
  }
}
