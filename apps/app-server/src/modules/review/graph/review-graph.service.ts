import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
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

export interface ReviewGraphServiceOptions {
  seedFixture?: boolean;
}

@Injectable()
export class ReviewGraphService {
  constructor(
    private readonly graphRepository: InMemoryReviewGraphRepository,
    @Optional()
    options: ReviewGraphServiceOptions = {},
  ) {
    if (options.seedFixture) {
      this.seedFixture();
    }
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
      intentSummary: graph.intentSummary,
      reviewStrategy: graph.reviewStrategy,
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
        reviewOrder: node.reviewOrder,
        roleSummary: node.roleSummary,
        reviewReason: node.reviewReason,
        position: node.position,
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
    const changedAt = this.timestampOrNow(input.changedAt);

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

  private timestampOrNow(value?: string): string {
    if (!value) {
      return new Date().toISOString();
    }

    if (Number.isNaN(Date.parse(value))) {
      throw new BadRequestException("changedAt must be a valid ISO timestamp");
    }

    return value;
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
        reviewOrder: 1,
        roleSummary:
          "OAuth provider가 돌려준 callback query를 읽어 성공/실패 화면으로 연결한다.",
        reviewReason:
          "로그인 실패와 redirect 처리 모두 사용자 흐름에 직접 영향을 준다.",
        position: { x: 120, y: 96 },
      },
      {
        id: "88888888-8888-4888-8888-888888888892",
        graphId,
        nodeType: "impact",
        label: "session redirect flow",
        filePath: null,
        functionName: null,
        riskLevel: "low",
        reviewOrder: 2,
        roleSummary:
          "callback 결과가 기존 session redirect 흐름과 충돌하지 않는지 확인한다.",
        reviewReason: "성공/실패 상태가 명확히 분기되면 영향 범위가 작다.",
        position: { x: 400, y: 188 },
      },
    ];

    this.graphRepository.saveGraph({
      id: graphId,
      analysisId: FIXTURE_ANALYSIS_ID,
      summary: "OAuth callback review graph",
      intentSummary:
        "로그인 callback 진입점을 만들고 provider error 상태를 사용자에게 보여준다.",
      reviewStrategy:
        "라우트 진입점, callback 상태 해석, redirect 영향 순서로 확인한다.",
      reviewOrder: nodes.map((node) => node.id),
    });

    nodes.forEach((node) => this.graphRepository.saveNode(node));
  }
}
