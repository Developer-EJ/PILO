import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InMemoryReviewGraphRepository } from "./in-memory-review-graph.repository";
import {
  NodeReviewStateRecord,
  ReviewGraphSummary,
  ReviewNodeRecord,
  ReviewNodeStatus,
  UpsertNodeReviewStateInput,
} from "./review-graph.types";

const NODE_STATUSES = ["ok", "discuss", "unknown"];
const FIXTURE_ANALYSIS_ID = "88888888-8888-4888-8888-888888888881";

@Injectable()
export class ReviewGraphService {
  constructor(private readonly graphRepository: InMemoryReviewGraphRepository) {
    this.seedFixture();
  }

  getGraph(analysisId: string): ReviewGraphSummary {
    const graph = this.graphRepository.findGraphByAnalysis(analysisId);

    if (!graph) {
      throw new NotFoundException(`Review graph was not found: ${analysisId}`);
    }

    return {
      id: graph.id,
      analysisId: graph.analysisId,
      summary: graph.summary,
      reviewOrder: graph.reviewOrder,
      nodes: this.graphRepository.listNodesByGraph(graph.id).map((node) => ({
        id: node.id,
        analysisId: graph.analysisId,
        nodeType: node.nodeType,
        label: node.label,
        filePath: node.filePath,
        functionName: node.functionName,
        riskLevel: node.riskLevel,
        status: this.toNodeStatus(node.id),
      })),
    };
  }

  upsertNodeState(
    nodeId: string,
    input: UpsertNodeReviewStateInput,
  ): NodeReviewStateRecord {
    const node = this.graphRepository.findNodeById(nodeId);

    if (!node) {
      throw new NotFoundException(`Review node was not found: ${nodeId}`);
    }

    const status = this.toStatus(input.status);
    const existing = this.graphRepository.findStateByNodeReviewer(
      nodeId,
      input.reviewerMemberId,
    );
    const changedAt = input.changedAt ?? new Date().toISOString();

    return this.graphRepository.saveState({
      id: existing?.id ?? randomUUID(),
      nodeId,
      reviewerMemberId: this.requiredString(
        input.reviewerMemberId,
        "reviewerMemberId",
      ),
      status,
      comment: input.comment ?? null,
      createdAt: existing?.createdAt ?? changedAt,
      updatedAt: changedAt,
    });
  }

  private toNodeStatus(nodeId: string): ReviewNodeStatus {
    const states = this.graphRepository.listStatesByNode(nodeId);

    if (states.some((state) => state.status === "discuss")) {
      return "discuss";
    }

    return states.some((state) => state.status === "ok") ? "ok" : "unknown";
  }

  private toStatus(value: string): ReviewNodeStatus {
    if (NODE_STATUSES.includes(value)) {
      return value as ReviewNodeStatus;
    }

    throw new BadRequestException(`Invalid review node status: ${value}`);
  }

  private requiredString(value: string, field: string): string {
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    throw new BadRequestException(`${field} is required`);
  }

  private seedFixture(): void {
    const graphId = "88888888-8888-4888-8888-8888888888d1";
    const nodes: ReviewNodeRecord[] = [
      {
        id: "88888888-8888-4888-8888-888888888891",
        graphId,
        nodeType: "file",
        label: "apps/frontend/app/auth/callback/page.tsx",
        filePath: "apps/frontend/app/auth/callback/page.tsx",
        functionName: null,
        riskLevel: "medium",
      },
      {
        id: "88888888-8888-4888-8888-888888888892",
        graphId,
        nodeType: "impact",
        label: "session redirect flow",
        filePath: null,
        functionName: null,
        riskLevel: "low",
      },
    ];

    this.graphRepository.saveGraph({
      id: graphId,
      analysisId: FIXTURE_ANALYSIS_ID,
      summary: "OAuth callback review graph",
      reviewOrder: nodes.map((node) => node.id),
    });

    nodes.forEach((node) => this.graphRepository.saveNode(node));
  }
}
