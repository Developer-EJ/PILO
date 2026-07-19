import { Injectable } from "@nestjs/common";
import {
  getAgentToolDomainAndOperation,
  type AgentToolOperation
} from "./agent-tool-capability-catalog";

/**
 * Domain rollout is deliberately independent from the global retrieval mode.
 * An unset flag preserves the already-deployed registry; an explicitly supplied
 * value is strict so a typo never opens a domain by accident.
 */
@Injectable()
export class AgentDomainFeatureFlagService {
  isToolEnabled(toolName: string): boolean {
    const descriptor = getAgentToolDomainAndOperation(toolName);
    return !descriptor || this.isEnabled(descriptor.domain, descriptor.operation);
  }

  isEnabled(domain: string, operation: AgentToolOperation): boolean {
    const value = process.env[this.environmentKey(domain, operation)];
    if (value === undefined) {
      return true;
    }
    return value.trim().toLowerCase() === "true";
  }

  environmentKey(domain: string, operation: AgentToolOperation): string {
    return `AGENT_DOMAIN_${domain.toUpperCase().replaceAll("-", "_")}_${operation.toUpperCase()}_ENABLED`;
  }
}
