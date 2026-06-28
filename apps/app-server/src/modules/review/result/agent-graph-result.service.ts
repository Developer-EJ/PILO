import { BadRequestException, Injectable } from "@nestjs/common";
import { InMemoryReviewGraphRepository } from "../graph/in-memory-review-graph.repository";
import {
  ReviewGraphSummary,
  ReviewNodeRecord,
  ReviewNodeType,
} from "../graph/review-graph.types";
import type { ReviewRiskLevel } from "../public";

const NODE_TYPES = [
  "file",
  "function",
  "api",
  "route",
  "schema",
  "config",
  "risk",
  "impact",
];
const RISK_LEVELS = ["low", "medium", "high", "critical"];

export interface AgentReviewGraphResult {
  summary?: string | null;
  reviewOrder?: string[];
  nodes?: AgentReviewNodeResult[];
}

export interface AgentReviewNodeResult {
  id: string;
  nodeType: string;
  label: string;
  filePath?: string | null;
  functionName?: string | null;
  riskLevel?: string;
}

@Injectable()
export class AgentGraphResultService {
  constructor(
    private readonly graphRepository: InMemoryReviewGraphRepository,
  ) {}

  applyGraph(
    analysisId: string,
    graphResult: AgentReviewGraphResult,
  ): ReviewGraphSummary {
    const nodes = graphResult.nodes ?? [];
    const existingGraph = this.graphRepository.findGraphByAnalysis(analysisId);
    const graphId = existingGraph?.id ?? `review-graph-${analysisId}`;
    const reviewOrder = graphResult.reviewOrder ?? nodes.map((node) => node.id);

    this.graphRepository.saveGraph({
      id: graphId,
      analysisId,
      summary: graphResult.summary ?? null,
      reviewOrder,
    });

    for (const node of nodes) {
      this.graphRepository.saveNode(this.toNodeRecord(graphId, node));
    }

    return {
      id: graphId,
      analysisId,
      summary: graphResult.summary ?? null,
      reviewOrder,
      nodes: this.graphRepository.listNodesByGraph(graphId).map((node) => ({
        id: node.id,
        analysisId,
        nodeType: node.nodeType,
        label: node.label,
        filePath: node.filePath,
        functionName: node.functionName,
        riskLevel: node.riskLevel,
        status: "unknown",
      })),
    };
  }

  private toNodeRecord(
    graphId: string,
    node: AgentReviewNodeResult,
  ): ReviewNodeRecord {
    return {
      id: this.requiredString(node.id, "node.id"),
      graphId,
      nodeType: this.toNodeType(node.nodeType),
      label: this.requiredString(node.label, "node.label"),
      filePath: node.filePath ?? null,
      functionName: node.functionName ?? null,
      riskLevel: this.toRiskLevel(node.riskLevel ?? "low"),
    };
  }

  private toNodeType(value: string): ReviewNodeType {
    if (NODE_TYPES.includes(value)) {
      return value as ReviewNodeType;
    }

    throw new BadRequestException(`Invalid review node type: ${value}`);
  }

  private toRiskLevel(value: string): ReviewRiskLevel {
    if (RISK_LEVELS.includes(value)) {
      return value as ReviewRiskLevel;
    }

    throw new BadRequestException(`Invalid review node risk level: ${value}`);
  }

  private requiredString(value: string, field: string): string {
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    throw new BadRequestException(`${field} is required`);
  }
}
