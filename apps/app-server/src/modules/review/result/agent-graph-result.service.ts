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
  intentSummary?: string | null;
  reviewStrategy?: string | null;
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
  reviewOrder?: number;
  roleSummary?: string | null;
  reviewReason?: string | null;
  position?: { x?: number; y?: number } | null;
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
      intentSummary:
        graphResult.intentSummary ?? graphResult.summary ?? "PR 변경 의도",
      reviewStrategy:
        graphResult.reviewStrategy ??
        "AI가 제안한 순서대로 변경 파일을 확인한다.",
      reviewOrder,
    });

    for (const node of nodes) {
      this.graphRepository.saveNode(this.toNodeRecord(graphId, node));
    }

    return {
      id: graphId,
      analysisId,
      summary: graphResult.summary ?? null,
      intentSummary:
        graphResult.intentSummary ?? graphResult.summary ?? "PR 변경 의도",
      reviewStrategy:
        graphResult.reviewStrategy ??
        "AI가 제안한 순서대로 변경 파일을 확인한다.",
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
        reviewOrder: node.reviewOrder,
        roleSummary: node.roleSummary,
        reviewReason: node.reviewReason,
        position: node.position,
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
      reviewOrder: this.positiveInteger(
        node.reviewOrder ?? 1,
        "node.reviewOrder",
      ),
      roleSummary: this.requiredString(
        node.roleSummary ?? node.label,
        "node.roleSummary",
      ),
      reviewReason: this.requiredString(
        node.reviewReason ?? node.roleSummary ?? node.label,
        "node.reviewReason",
      ),
      position: {
        x: this.nonNegativeInteger(node.position?.x ?? 0, "node.position.x"),
        y: this.nonNegativeInteger(node.position?.y ?? 0, "node.position.y"),
      },
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

  private positiveInteger(value: number, field: string): number {
    if (Number.isInteger(value) && value >= 1) {
      return value;
    }

    throw new BadRequestException(`${field} must be a positive integer`);
  }

  private nonNegativeInteger(value: number, field: string): number {
    if (Number.isInteger(value) && value >= 0) {
      return value;
    }

    throw new BadRequestException(`${field} must be a non-negative integer`);
  }
}
